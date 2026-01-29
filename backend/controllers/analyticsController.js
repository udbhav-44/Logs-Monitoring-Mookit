const Log = require('../models/Log');

const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const CACHE_TTL_MS = {
    overview: toNumber(process.env.OVERVIEW_CACHE_TTL_MS, 5000),
    suspicious: toNumber(process.env.SUSPICIOUS_CACHE_TTL_MS, 15000),
    applications: toNumber(process.env.APPLICATIONS_CACHE_TTL_MS, 30000)
};

const cache = new Map();

const getCached = (key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.value;
};

const setCached = (key, value, ttlMs) => {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
};

const PRECOMPUTE_RANGES = ['24h', '7d', '30d', 'all'];
const OVERVIEW_PRECOMPUTE_MS = toNumber(process.env.OVERVIEW_PRECOMPUTE_MS, 5000);
const precomputedOverview = new Map();
let overviewPrecomputeTimer = null;
let overviewPrecomputeInFlight = false;

const getOverviewRangeKey = (params = {}) => {
    const range = String(params.range || '24h').toLowerCase();
    return PRECOMPUTE_RANGES.includes(range) ? range : null;
};

const buildCacheKey = (prefix, params = {}) => {
    const entries = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .sort(([a], [b]) => a.localeCompare(b));
    return `${prefix}:${JSON.stringify(entries)}`;
};

const toDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const getRangeWindow = (params = {}, defaultRange = '24h') => {
    const start = toDate(params.start);
    const end = toDate(params.end);
    if (start || end) return { start, end };

    const range = String(params.range || '').toLowerCase() || defaultRange;
    const now = Date.now();

    if (range === 'all') return { start: null, end: null };
    if (range === '7d') return { start: new Date(now - DAYS_7), end: new Date(now) };
    if (range === '30d') return { start: new Date(now - DAYS_30), end: new Date(now) };
    if (range === '24h') return { start: new Date(now - HOURS_24), end: new Date(now) };

    return { start: new Date(now - HOURS_24), end: new Date(now) };
};

const buildTimeMatch = (start, end) => {
    const match = {};
    if (start || end) {
        match.timestamp = {};
        if (start) match.timestamp.$gte = start;
        if (end) match.timestamp.$lte = end;
    }
    return match;
};

const resolveBucket = (start, end) => {
    const spanMs = start && end ? end - start : null;
    const useDaily = !start || !end || (spanMs !== null && spanMs > DAYS_7);
    return {
        unit: useDaily ? 'day' : 'hour',
        format: useDaily ? '%Y-%m-%d' : '%Y-%m-%dT%H'
    };
};

const buildQuery = (params = {}) => {
    const query = {};

    const start = toDate(params.start);
    const end = toDate(params.end);
    if (start || end) {
        query.timestamp = {};
        if (start) query.timestamp.$gte = start;
        if (end) query.timestamp.$lte = end;
    }

    const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (params.ip) query['parsedData.ip'] = params.ip;
    if (params.uid) query['parsedData.uid'] = params.uid;
    if (params.course) {
        query['parsedData.course'] = { $regex: escapeRegex(params.course), $options: 'i' };
    }
    if (params.sourceType) query.sourceType = params.sourceType;
    if (params.app) query['appInfo.name'] = params.app;
    if (params.vmId) query['appInfo.vmId'] = params.vmId;

    if (params.status) {
        query['parsedData.status'] = Number(params.status);
    } else if (params.minStatus || params.maxStatus) {
        query['parsedData.status'] = {};
        if (params.minStatus) query['parsedData.status'].$gte = Number(params.minStatus);
        if (params.maxStatus) query['parsedData.status'].$lte = Number(params.maxStatus);
    }

    return query;
};

const computeOverviewPayload = async (params = {}) => {
    const { start: windowStart, end: windowEnd } = getRangeWindow(params, '24h');
    const windowMatch = buildTimeMatch(windowStart, windowEnd);
    const { unit: bucketUnit, format: bucketFormat } = resolveBucket(windowStart, windowEnd);
    const now = Date.now();
    const last24h = new Date(now - HOURS_24);
    const last7d = new Date(now - DAYS_7);
    const windowCountPromise = Object.keys(windowMatch).length
        ? Log.countDocuments(windowMatch)
        : Log.estimatedDocumentCount();

    const [overall, last7dCount, last24hCount, windowCountRaw, last24hAgg, applications] =
        await Promise.all([
            Log.estimatedDocumentCount(),
            Log.countDocuments({ timestamp: { $gte: last7d } }),
            Log.countDocuments({ timestamp: { $gte: last24h } }),
            windowCountPromise,
            Log.aggregate([
                ...(Object.keys(windowMatch).length ? [{ $match: windowMatch }] : []),
                {
                    $facet: {
                        statusDist: [
                            { $match: { 'parsedData.status': { $exists: true } } },
                            { $group: { _id: '$parsedData.status', count: { $sum: 1 } } },
                            { $sort: { _id: 1 } }
                        ],
                        traffic: [
                            {
                                $group: {
                                    _id: { $dateToString: { format: bucketFormat, date: '$timestamp' } },
                                    count: { $sum: 1 }
                                }
                            },
                            { $sort: { _id: 1 } }
                        ],
                        errorTrend: [
                            { $match: { 'parsedData.status': { $gte: 400 } } },
                            {
                                $group: {
                                    _id: { $dateToString: { format: bucketFormat, date: '$timestamp' } },
                                    count: { $sum: 1 }
                                }
                            },
                            { $sort: { _id: 1 } }
                        ],
                        topEndpoints: [
                            { $addFields: { endpoint: { $ifNull: ['$parsedData.url', '$parsedData.message'] } } },
                            {
                                $group: {
                                    _id: '$endpoint',
                                    count: { $sum: 1 },
                                    errors: { $sum: { $cond: [{ $gte: ['$parsedData.status', 400] }, 1, 0] } },
                                    lastSeen: { $max: '$timestamp' }
                                }
                            },
                            { $sort: { count: -1 } },
                            { $limit: 5 }
                        ],
                        topIps: [
                            {
                                $group: {
                                    _id: '$parsedData.ip',
                                    count: { $sum: 1 },
                                    errors: { $sum: { $cond: [{ $gte: ['$parsedData.status', 400] }, 1, 0] } },
                                    lastSeen: { $max: '$timestamp' }
                                }
                            },
                            { $sort: { count: -1 } },
                            { $limit: 5 }
                        ],
                        topUids: [
                            {
                                $group: {
                                    _id: '$parsedData.uid',
                                    count: { $sum: 1 },
                                    errors: { $sum: { $cond: [{ $gte: ['$parsedData.status', 400] }, 1, 0] } },
                                    lastSeen: { $max: '$timestamp' }
                                }
                            },
                            { $sort: { count: -1 } },
                            { $limit: 5 }
                        ]
                    }
                }
            ]).allowDiskUse(true),
            Log.aggregate([
                ...(Object.keys(windowMatch).length ? [{ $match: windowMatch }] : []),
                {
                    $group: {
                        _id: '$appInfo.name',
                        total: { $sum: 1 },
                        errors: { $sum: { $cond: [{ $gte: ['$parsedData.status', 400] }, 1, 0] } },
                        vmIds: { $addToSet: '$appInfo.vmId' },
                        nginxCount: { $sum: { $cond: [{ $eq: ['$sourceType', 'nginx'] }, 1, 0] } },
                        appCount: { $sum: { $cond: [{ $eq: ['$sourceType', 'app'] }, 1, 0] } },
                        dbCount: { $sum: { $cond: [{ $eq: ['$sourceType', 'db'] }, 1, 0] } }
                    }
                }
            ]).allowDiskUse(true)
        ]);

    const facet = last24hAgg[0] || {};
    const statusDist = facet.statusDist || [];
    const traffic = facet.traffic || [];
    const errorTrend = facet.errorTrend || [];
    const topEndpoints = facet.topEndpoints || [];
    const topIps = facet.topIps || [];
    const topUids = facet.topUids || [];

    const statusBuckets = { ok2xx: 0, redirect3xx: 0, client4xx: 0, server5xx: 0 };
    statusDist.forEach(item => {
        if (item._id >= 500) statusBuckets.server5xx += item.count;
        else if (item._id >= 400) statusBuckets.client4xx += item.count;
        else if (item._id >= 300) statusBuckets.redirect3xx += item.count;
        else if (item._id >= 200) statusBuckets.ok2xx += item.count;
    });

    const appView = applications.map(app => ({
        app: app._id || 'unknown-app',
        total: app.total,
        errors: app.errors,
        vmIds: app.vmIds,
        errorRate: app.total ? Number(((app.errors / app.total) * 100).toFixed(1)) : 0,
        sources: {
            nginx: app.nginxCount || 0,
            app: app.appCount || 0,
            db: app.dbCount || 0
        }
    })).sort((a, b) => b.total - a.total);

    const windowCount = Object.keys(windowMatch).length ? windowCountRaw : overall;
    return {
        totals: {
            overall,
            last7d: last7dCount,
            last24h: last24hCount,
            window: windowCount
        },
        statusDist: statusDist.map(s => ({ code: s._id, count: s.count })),
        statusBuckets,
        traffic: traffic.map(t => ({ bucket: t._id, count: t.count })),
        errorTrend: errorTrend.map(t => ({ bucket: t._id, count: t.count })),
        topEndpoints: topEndpoints.map(e => ({ endpoint: e._id, count: e.count, errors: e.errors, lastSeen: e.lastSeen })),
        topIps: topIps.map(e => ({ ip: e._id, count: e.count, errors: e.errors, lastSeen: e.lastSeen })),
        topUids: topUids.map(e => ({ uid: e._id, count: e.count, errors: e.errors, lastSeen: e.lastSeen })),
        applications: appView,
        bucketUnit,
        range: { start: windowStart, end: windowEnd }
    };
};

const startOverviewPrecompute = () => {
    if (overviewPrecomputeTimer || OVERVIEW_PRECOMPUTE_MS <= 0) return;
    const run = async () => {
        if (overviewPrecomputeInFlight) return;
        overviewPrecomputeInFlight = true;
        try {
            for (const range of PRECOMPUTE_RANGES) {
                const payload = await computeOverviewPayload({ range });
                precomputedOverview.set(range, { payload, updatedAt: Date.now() });
            }
        } catch (error) {
            console.error('Overview precompute failed:', error.message);
        } finally {
            overviewPrecomputeInFlight = false;
        }
    };
    run();
    overviewPrecomputeTimer = setInterval(run, OVERVIEW_PRECOMPUTE_MS);
};

// @desc    Get UID Directory
// @route   GET /api/analytics/uids
const getUidDirectory = async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 500, 2000);
        const start = toDate(req.query.start);
        const end = toDate(req.query.end);
        const search = req.query.search ? String(req.query.search) : null;

        const match = { 'parsedData.uid': { $exists: true, $ne: null, $ne: '' } };
        if (start || end) {
            match.timestamp = {};
            if (start) match.timestamp.$gte = start;
            if (end) match.timestamp.$lte = end;
        }
        if (search) {
            match['parsedData.uid'] = { $regex: search, $options: 'i' };
        }

        const uids = await Log.aggregate([
            { $match: match },
            { $group: { _id: '$parsedData.uid', count: { $sum: 1 }, lastSeen: { $max: '$timestamp' } } },
            { $sort: { lastSeen: -1 } },
            { $limit: limit }
        ]);

        res.json(uids.map(item => ({ uid: item._id, count: item.count, lastSeen: item.lastSeen })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Overview Stats
// @route   GET /api/analytics/overview
const getOverviewStats = async (req, res) => {
    try {
        const cacheKey = buildCacheKey('overview', req.query);
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);
        const hasCustomWindow = Boolean(req.query.start || req.query.end);
        const rangeKey = getOverviewRangeKey(req.query);
        if (!hasCustomWindow && rangeKey) {
            const precomputed = precomputedOverview.get(rangeKey);
            if (precomputed?.payload) {
                setCached(cacheKey, precomputed.payload, CACHE_TTL_MS.overview);
                return res.json(precomputed.payload);
            }
        }

        const payload = await computeOverviewPayload(req.query);
        setCached(cacheKey, payload, CACHE_TTL_MS.overview);
        res.json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Search Logs
// @route   GET /api/analytics/search
const searchLogs = async (req, res) => {
    try {
        const { limit = 50, page = 1, search } = req.query;
        const pageSize = Math.min(parseInt(limit, 10) || 50, 200);
        const currentPage = Math.max(parseInt(page, 10) || 1, 1);
        const query = buildQuery(req.query);
        const skip = (currentPage - 1) * pageSize;

        const searchTerm = search ? String(search).trim() : '';
        const searchQuery = searchTerm ? { ...query, $text: { $search: searchTerm } } : query;

        let total = 0;
        let results = [];

        try {
            total = await Log.countDocuments(searchQuery);
            results = await Log.find(searchQuery)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean();
        } catch (error) {
            if (!searchTerm || !/text index/i.test(error.message)) {
                throw error;
            }
            const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'i');
            const fallbackQuery = {
                ...query,
                $or: [
                    { rawMessage: regex },
                    { 'parsedData.message': regex },
                    { 'parsedData.url': regex }
                ]
            };
            total = await Log.countDocuments(fallbackQuery);
            results = await Log.find(fallbackQuery)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean();
        }

        res.json({
            results,
            total,
            page: currentPage,
            pageSize,
            pages: Math.max(1, Math.ceil(total / pageSize))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get User Activity
// @route   GET /api/analytics/activity
const getUserActivity = async (req, res) => {
    try {
        const { uid } = req.query;
        if (!uid) return res.status(400).json({ message: 'UID required' });

        const query = buildQuery({ ...req.query, uid });
        const logs = await Log.find(query).sort({ timestamp: -1 }).limit(500).lean();

        const statusBuckets = { ok2xx: 0, redirect3xx: 0, client4xx: 0, server5xx: 0 };
        const topActionsMap = {};
        const ips = new Set();

        logs.forEach(log => {
            const status = Number(log.parsedData?.status);
            if (status >= 500) statusBuckets.server5xx++;
            else if (status >= 400) statusBuckets.client4xx++;
            else if (status >= 300) statusBuckets.redirect3xx++;
            else if (status >= 200) statusBuckets.ok2xx++;

            const action = log.parsedData?.url || log.parsedData?.message;
            if (action) topActionsMap[action] = (topActionsMap[action] || 0) + 1;

            if (log.parsedData?.ip) ips.add(log.parsedData.ip);
        });

        const topActions = Object.entries(topActionsMap)
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        res.json({
            uid,
            summary: {
                total: logs.length,
                firstSeen: logs.length ? logs[logs.length - 1].timestamp : null,
                lastSeen: logs.length ? logs[0].timestamp : null,
                ips: Array.from(ips),
                statusBuckets,
                topActions
            },
            timeline: logs,
            hourlyActivity: [] // kept for compatibility; could be derived client-side if needed
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Suspicious Activity
// @route   GET /api/analytics/suspicious
const getSuspiciousActivity = async (req, res) => {
    try {
        const cacheKey = buildCacheKey('suspicious', req.query);
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const { start: windowStart, end: windowEnd } = getRangeWindow(req.query, '24h');
        const windowMatch = buildTimeMatch(windowStart, windowEnd);

        const unauthorized = await Log.aggregate([
            {
                $match: {
                    ...windowMatch,
                    'parsedData.status': { $in: [401, 403] },
                    'parsedData.ip': { $exists: true, $ne: null }
                }
            },
            { $group: { _id: '$parsedData.ip', count: { $sum: 1 }, lastSeen: { $max: '$timestamp' } } },
            { $match: { count: { $gte: 8 } } },
            { $sort: { count: -1 } },
            { $limit: 50 }
        ]);

        const serverErrors = await Log.aggregate([
            {
                $match: {
                    ...windowMatch,
                    'parsedData.status': { $gte: 500 },
                    'parsedData.ip': { $exists: true, $ne: null }
                }
            },
            { $group: { _id: '$parsedData.ip', count: { $sum: 1 }, lastSeen: { $max: '$timestamp' } } },
            { $match: { count: { $gte: 6 } } },
            { $sort: { count: -1 } },
            { $limit: 50 }
        ]);

        const perMinuteBursts = await Log.aggregate([
            { $match: { ...windowMatch, 'parsedData.ip': { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: {
                        ip: '$parsedData.ip',
                        minute: { $dateToString: { format: '%Y-%m-%dT%H:%M', date: '$timestamp' } }
                    },
                    count: { $sum: 1 }
                }
            },
            { $match: { count: { $gte: 60 } } },
            {
                $group: {
                    _id: '$_id.ip',
                    count: { $max: '$count' },
                    lastSeen: { $max: '$_id.minute' }
                }
            }
        ]);

        const alerts = [];

        unauthorized.forEach(item => alerts.push({
            type: 'unauthorized_burst',
            actor: item._id,
            count: item.count,
            severity: 'high',
            lastSeen: item.lastSeen,
            description: 'Repeated 401/403 responses from single IP within 24h'
        }));

        serverErrors.forEach(item => alerts.push({
            type: 'server_error_spike',
            actor: item._id,
            count: item.count,
            severity: 'medium',
            lastSeen: item.lastSeen,
            description: 'High volume of 5xx responses'
        }));

        perMinuteBursts.forEach(item => alerts.push({
            type: 'high_request_rate',
            actor: item._id,
            count: item.count,
            severity: 'medium',
            lastSeen: item.lastSeen,
            description: `High request rate detected (${item.count}/min)`
        }));

        alerts.sort((a, b) => b.count - a.count);

        setCached(cacheKey, alerts, CACHE_TTL_MS.suspicious);
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Application-wise summary
// @route   GET /api/analytics/applications
const getApplicationOverview = async (req, res) => {
    try {
        const cacheKey = buildCacheKey('applications', req.query);
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const { start: windowStart, end: windowEnd } = getRangeWindow(req.query, 'all');
        const windowMatch = buildTimeMatch(windowStart, windowEnd);
        const pipeline = [];
        if (Object.keys(windowMatch).length) {
            pipeline.push({ $match: windowMatch });
        }
        pipeline.push({
            $group: {
                _id: '$appInfo.name',
                total: { $sum: 1 },
                errors: { $sum: { $cond: [{ $gte: ['$parsedData.status', 400] }, 1, 0] } },
                vmIds: { $addToSet: '$appInfo.vmId' },
                nginxCount: { $sum: { $cond: [{ $eq: ['$sourceType', 'nginx'] }, 1, 0] } },
                appCount: { $sum: { $cond: [{ $eq: ['$sourceType', 'app'] }, 1, 0] } },
                dbCount: { $sum: { $cond: [{ $eq: ['$sourceType', 'db'] }, 1, 0] } }
            }
        });

        const applications = await Log.aggregate(pipeline).allowDiskUse(true);

        const appView = applications.map(app => ({
            app: app._id || 'unknown-app',
            total: app.total,
            errors: app.errors,
            vmIds: app.vmIds,
            errorRate: app.total ? Number(((app.errors / app.total) * 100).toFixed(1)) : 0,
            sources: {
                nginx: app.nginxCount || 0,
                app: app.appCount || 0,
                db: app.dbCount || 0
            }
        })).sort((a, b) => b.total - a.total);

        const payload = { applications: appView, range: { start: windowStart, end: windowEnd } };
        setCached(cacheKey, payload, CACHE_TTL_MS.applications);
        res.json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getOverviewStats,
    startOverviewPrecompute,
    searchLogs,
    getUserActivity,
    getSuspiciousActivity,
    getApplicationOverview,
    getUidDirectory
};
