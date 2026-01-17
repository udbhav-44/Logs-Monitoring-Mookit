const Log = require('../models/Log');

const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

const toDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
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

    if (params.ip) query['parsedData.ip'] = params.ip;
    if (params.uid) query['parsedData.uid'] = params.uid;
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

const applyTextFilter = (docs, searchTerm) => {
    if (!searchTerm) return docs;
    const needle = searchTerm.toLowerCase();
    return docs.filter(doc => {
        const raw = (doc.rawMessage || '').toLowerCase();
        const parsedMsg = (doc.parsedData?.message || '').toLowerCase();
        const url = (doc.parsedData?.url || '').toLowerCase();
        return raw.includes(needle) || parsedMsg.includes(needle) || url.includes(needle);
    });
};

// @desc    Get Overview Stats
// @route   GET /api/analytics/overview
const getOverviewStats = async (req, res) => {
    try {
        const now = Date.now();
        const last24h = new Date(now - HOURS_24);
        const last7d = new Date(now - DAYS_7);

        const [overall, last7dCount, last24hCount, statusDist, traffic, errorTrend, topEndpoints, topIps, topUids, applications] =
            await Promise.all([
                Log.estimatedDocumentCount(),
                Log.countDocuments({ timestamp: { $gte: last7d } }),
                Log.countDocuments({ timestamp: { $gte: last24h } }),
                Log.aggregate([
                    { $match: { timestamp: { $gte: last24h }, 'parsedData.status': { $exists: true } } },
                    { $group: { _id: '$parsedData.status', count: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]),
                Log.aggregate([
                    { $match: { timestamp: { $gte: last24h } } },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m-%dT%H', date: '$timestamp' } },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]),
                Log.aggregate([
                    { $match: { timestamp: { $gte: last24h }, 'parsedData.status': { $gte: 400 } } },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m-%dT%H', date: '$timestamp' } },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]),
                Log.aggregate([
                    { $match: { timestamp: { $gte: last24h } } },
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
                ]),
                Log.aggregate([
                    { $match: { timestamp: { $gte: last24h } } },
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
                ]),
                Log.aggregate([
                    { $match: { timestamp: { $gte: last24h } } },
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
                ]),
                Log.aggregate([
                    {
                        $group: {
                            _id: '$appInfo.name',
                            total: { $sum: 1 },
                            errors: { $sum: { $cond: [{ $gte: ['$parsedData.status', 400] }, 1, 0] } },
                            vmIds: { $addToSet: '$appInfo.vmId' },
                            sources: { $push: '$sourceType' }
                        }
                    }
                ])
            ]);

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
            sources: app.sources.reduce((acc, src) => {
                acc[src] = (acc[src] || 0) + 1;
                return acc;
            }, {})
        })).sort((a, b) => b.total - a.total);

        res.json({
            totals: {
                overall,
                last7d: last7dCount,
                last24h: last24hCount
            },
            statusDist: statusDist.map(s => ({ code: s._id, count: s.count })),
            statusBuckets,
            traffic: traffic.map(t => ({ bucket: t._id, count: t.count })),
            errorTrend: errorTrend.map(t => ({ bucket: t._id, count: t.count })),
            topEndpoints: topEndpoints.map(e => ({ endpoint: e._id, count: e.count, errors: e.errors, lastSeen: e.lastSeen })),
            topIps: topIps.map(e => ({ ip: e._id, count: e.count, errors: e.errors, lastSeen: e.lastSeen })),
            topUids: topUids.map(e => ({ uid: e._id, count: e.count, errors: e.errors, lastSeen: e.lastSeen })),
            applications: appView
        });
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

        let total = 0;
        let results = [];

        if (search) {
            const docs = await Log.find(query).sort({ timestamp: -1 }).lean();
            const filtered = applyTextFilter(docs, search);
            total = filtered.length;
            results = filtered.slice(skip, skip + pageSize);
        } else {
            total = await Log.countDocuments(query);
            results = await Log.find(query)
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
        const windowStart = new Date(Date.now() - HOURS_24);

        const unauthorized = await Log.aggregate([
            {
                $match: {
                    timestamp: { $gte: windowStart },
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
                    timestamp: { $gte: windowStart },
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
            { $match: { timestamp: { $gte: windowStart }, 'parsedData.ip': { $exists: true, $ne: null } } },
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

        res.json(alerts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Application-wise summary
// @route   GET /api/analytics/applications
const getApplicationOverview = async (req, res) => {
    try {
        const applications = await Log.aggregate([
            {
                $group: {
                    _id: '$appInfo.name',
                    total: { $sum: 1 },
                    errors: { $sum: { $cond: [{ $gte: ['$parsedData.status', 400] }, 1, 0] } },
                    vmIds: { $addToSet: '$appInfo.vmId' },
                    sources: { $push: '$sourceType' }
                }
            }
        ]);

        const appView = applications.map(app => ({
            app: app._id || 'unknown-app',
            total: app.total,
            errors: app.errors,
            vmIds: app.vmIds,
            errorRate: app.total ? Number(((app.errors / app.total) * 100).toFixed(1)) : 0,
            sources: app.sources.reduce((acc, src) => {
                acc[src] = (acc[src] || 0) + 1;
                return acc;
            }, {})
        })).sort((a, b) => b.total - a.total);

        res.json({ applications: appView });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getOverviewStats, searchLogs, getUserActivity, getSuspiciousActivity, getApplicationOverview };
