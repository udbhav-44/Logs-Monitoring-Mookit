const { getClient } = require('../config/clickhouse');

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

const buildCacheKey = (prefix, params = {}) => {
    const entries = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .sort(([a], [b]) => a.localeCompare(b));
    return `${prefix}:${JSON.stringify(entries)}`;
};

const getTimeRangeSQL = (params = {}, defaultHours = 8760) => {
    if (params.start && params.end) {
        const startDate = new Date(params.start);
        const endDate = new Date(params.end);
        return `timestamp >= toDateTime(${Math.floor(startDate.getTime() / 1000)}) AND timestamp <= toDateTime(${Math.floor(endDate.getTime() / 1000)})`;
    }
    if (params.start) {
        const startDate = new Date(params.start);
        return `timestamp >= toDateTime(${Math.floor(startDate.getTime() / 1000)})`;
    }
    const rangeMap = {
        '24h': 24,
        '7d': 7 * 24,
        '30d': 30 * 24,
        'all': 365 * 24
    };
    const hours = rangeMap[String(params.range || '').toLowerCase()] || defaultHours;
    return `timestamp >= now() - INTERVAL ${hours} HOUR`;
};

const buildWhereClause = (params) => {
    const conditions = [];

    if (params.sourceType) conditions.push(`sourceType = '${params.sourceType}'`);
    if (params.app) conditions.push(`app = '${params.app}'`);
    if (params.vmId) conditions.push(`vmId = '${params.vmId}'`);
    if (params.method) conditions.push(`method = '${params.method}'`);
    if (params.level) conditions.push(`level = '${params.level}'`);
    if (params.status) conditions.push(`status = ${Number(params.status)}`);
    if (params.ip) conditions.push(`ip = '${params.ip}'`);
    if (params.uid) conditions.push(`uid = '${params.uid}'`);
    if (params.course) {
        const safeCourse = String(params.course).replace(/'/g, "\\'");
        conditions.push(`course ILIKE '%${safeCourse}%'`);
    }

    // Status range filters
    if (params.minStatus && !params.maxStatus) {
        if (params.minStatus == 400) conditions.push(`status >= 400`);
        if (params.minStatus == 500) conditions.push(`status >= 500`);
    }

    return conditions;
};

// @desc    Get Overview Stats (Totals, Status Dist, Traffic, Top Lists)
const getOverviewStats = async (req, res) => {
    try {
        const cacheKey = buildCacheKey('overview', req.query);
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const client = getClient();
        const timeRange = getTimeRangeSQL(req.query);
        const whereConditions = buildWhereClause(req.query);
        const whereClause = whereConditions.length > 0
            ? `${timeRange} AND ${whereConditions.join(' AND ')}`
            : timeRange;

        // Determine window period for traffic aggregation
        const windowPeriod = req.query.range === '7d' ? '1 hour' : (req.query.range === '30d' ? '1 day' : '15 minute');

        // Total log count (Overall vs Window)
        const countsQuery = `
            SELECT 
                (SELECT count() FROM logs) as overall,
                count() as window
            FROM logs 
            WHERE ${whereClause}
        `;

        // Status distribution query
        const statusQuery = `
            SELECT status, count() as count 
            FROM logs 
            WHERE ${whereClause} AND status > 0
            GROUP BY status 
            ORDER BY status
        `;

        // Traffic query
        const trafficQuery = `
            SELECT 
                toStartOfInterval(timestamp, INTERVAL ${windowPeriod}) as bucket,
                count() as count
            FROM logs
            WHERE ${whereClause}
            GROUP BY bucket
            ORDER BY bucket
        `;

        // Top Endpoints
        const topEndpointsQuery = `
            SELECT url as endpoint, count() as count, countIf(status >= 400) as errors
            FROM logs 
            WHERE ${whereClause} AND url != ''
            GROUP BY endpoint 
            ORDER BY count DESC 
            LIMIT 10
        `;

        // Top IPs
        const topIpsQuery = `
            SELECT ip, count() as count 
            FROM logs 
            WHERE ${whereClause} AND ip != ''
            GROUP BY ip 
            ORDER BY count DESC 
            LIMIT 10
        `;

        // Top UIDs
        const topUidsQuery = `
            SELECT uid, count() as count 
            FROM logs 
            WHERE ${whereClause} AND uid != ''
            GROUP BY uid 
            ORDER BY count DESC 
            LIMIT 10
        `;

        // Applications summary for Dashboard
        const appsQuery = `
            SELECT 
                app,
                count() as total,
                countIf(status >= 400) as errors,
                groupUniqArray(vmId) as vmIds
            FROM logs
            WHERE ${whereClause}
            GROUP BY app
            ORDER BY total DESC
            LIMIT 10
        `;

        const [countsRes, statusResult, trafficResult, topEndpoints, topIps, topUids, appsResult] = await Promise.all([
            client.query({ query: countsQuery, format: 'JSONEachRow' }).then(r => r.json()),
            client.query({ query: statusQuery, format: 'JSONEachRow' }).then(r => r.json()),
            client.query({ query: trafficQuery, format: 'JSONEachRow' }).then(r => r.json()),
            client.query({ query: topEndpointsQuery, format: 'JSONEachRow' }).then(r => r.json()),
            client.query({ query: topIpsQuery, format: 'JSONEachRow' }).then(r => r.json()),
            client.query({ query: topUidsQuery, format: 'JSONEachRow' }).then(r => r.json()),
            client.query({ query: appsQuery, format: 'JSONEachRow' }).then(r => r.json())
        ]);

        const overall = Number(countsRes[0]?.overall || 0);
        const windowCount = Number(countsRes[0]?.window || 0);

        const statusBuckets = { ok2xx: 0, redirect3xx: 0, client4xx: 0, server5xx: 0 };
        const statusDist = statusResult.map(r => {
            const count = Number(r.count);
            const code = Number(r.status);
            if (code >= 500) statusBuckets.server5xx += count;
            else if (code >= 400) statusBuckets.client4xx += count;
            else if (code >= 300) statusBuckets.redirect3xx += count;
            else if (code >= 200) statusBuckets.ok2xx += count;
            return { code, count };
        });

        const traffic = trafficResult.map(r => ({
            bucket: r.bucket,
            count: Number(r.count)
        }));

        const result = {
            totals: { overall, window: windowCount },
            statusDist,
            statusBuckets,
            traffic,
            topEndpoints: topEndpoints.map(r => ({ ...r, count: Number(r.count), errors: Number(r.errors) })),
            topIps: topIps.map(r => ({ ...r, count: Number(r.count) })),
            topUids: topUids.map(r => ({ ...r, count: Number(r.count) })),
            applications: appsResult.map(r => ({
                app: r.app,
                total: Number(r.total),
                errors: Number(r.errors),
                errorRate: Number(r.total) ? Number(((Number(r.errors) / Number(r.total)) * 100).toFixed(1)) : 0,
                vmIds: r.vmIds || []
            })),
            range: { start: null, end: null },
            bucketUnit: windowPeriod
        };

        setCached(cacheKey, result, CACHE_TTL_MS.overview);
        res.json(result);
    } catch (error) {
        console.error('Overview Stats Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Application-wise summary
const getApplicationOverview = async (req, res) => {
    try {
        const cacheKey = buildCacheKey('applications', req.query);
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const client = getClient();
        const timeRange = getTimeRangeSQL(req.query, 30 * 24);

        const query = `
            SELECT 
                app,
                count() as total,
                countIf(status >= 400) as errors,
                groupUniqArray(vmId) as vmIds,
                groupArray(sourceType) as allSources
            FROM logs
            WHERE ${timeRange}
            GROUP BY app
            ORDER BY total DESC
        `;

        const result = await client.query({ query, format: 'JSONEachRow' });
        const rows = await result.json();

        const applications = rows.map(r => {
            const sources = {};
            (r.allSources || []).forEach(s => {
                sources[s] = (sources[s] || 0) + 1;
            });

            return {
                app: r.app,
                total: Number(r.total),
                errors: Number(r.errors),
                errorRate: Number(r.total) ? Number(((Number(r.errors) / Number(r.total)) * 100).toFixed(1)) : 0,
                vmIds: r.vmIds || [],
                sources: sources
            };
        });

        setCached(cacheKey, { applications }, CACHE_TTL_MS.applications);
        res.json({ applications });
    } catch (error) {
        console.error('Application Overview Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Search Logs
const searchLogs = async (req, res) => {
    try {
        const { limit = 50, page = 1, search } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const limitVal = Number(limit);

        const client = getClient();
        const timeRange = getTimeRangeSQL(req.query);
        const whereConditions = buildWhereClause(req.query);

        // Add text search if provided
        if (search) {
            const safeSearch = String(search).replace(/'/g, "\\'");
            whereConditions.push(`(
                rawMessage ILIKE '%${safeSearch}%' OR 
                url ILIKE '%${safeSearch}%' OR 
                parsedMessage ILIKE '%${safeSearch}%'
            )`);
        }

        const whereClause = whereConditions.length > 0
            ? `${timeRange} AND ${whereConditions.join(' AND ')}`
            : timeRange;

        const query = `
            SELECT 
                timestamp,
                sourceType,
                app,
                vmId,
                method,
                status,
                level,
                course,
                rawMessage,
                url,
                ip,
                uid,
                userAgent,
                parsedMessage,
                responseSize
            FROM logs
            WHERE ${whereClause}
            ORDER BY timestamp DESC
            LIMIT ${limitVal}
            OFFSET ${offset}
        `;

        const result = await client.query({ query, format: 'JSONEachRow' });
        const rows = await result.json();

        const results = rows.map(r => ({
            timestamp: r.timestamp,
            sourceType: r.sourceType,
            appInfo: {
                name: r.app,
                vmId: r.vmId
            },
            rawMessage: r.rawMessage,
            parsedData: {
                status: r.status > 0 ? Number(r.status) : undefined,
                method: r.method || undefined,
                url: r.url || undefined,
                ip: r.ip || undefined,
                uid: r.uid || undefined,
                course: r.course || undefined,
                message: r.parsedMessage || undefined,
                responseSize: r.responseSize || undefined
            }
        }));

        res.json({
            results,
            page: Number(page),
            pageSize: limitVal,
            total: 1000 // Approximate - full count queries can be expensive
        });
    } catch (error) {
        console.error('Search Logs Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get User Activity
const getUserActivity = async (req, res) => {
    try {
        const { uid } = req.query;
        if (!uid) return res.status(400).json({ message: 'UID required' });

        // Ensure we are using correct time range
        const client = getClient();
        const timeRange = getTimeRangeSQL(req.query, 7 * 24); // Default 7d
        const limitVal = 500; // Hard limit for timeline

        // 1. Fetch Timeline (Detailed Logs)
        const timelineQuery = `
            SELECT 
                timestamp, sourceType, app, vmId, method, status, level, course, rawMessage, url, ip, uid, userAgent, parsedMessage, responseSize
            FROM logs
            WHERE ${timeRange} AND uid = '${uid}'
            ORDER BY timestamp DESC
            LIMIT ${limitVal}
        `;

        const timelineResult = await client.query({ query: timelineQuery, format: 'JSONEachRow' });
        const timelineRows = await timelineResult.json();

        const timeline = timelineRows.map(r => ({
            timestamp: r.timestamp,
            sourceType: r.sourceType,
            appInfo: { name: r.app, vmId: r.vmId },
            rawMessage: r.rawMessage,
            parsedData: {
                status: r.status > 0 ? Number(r.status) : undefined,
                method: r.method || undefined,
                url: r.url || undefined,
                ip: r.ip || undefined,
                uid: r.uid || undefined,
                course: r.course || undefined,
                message: r.parsedMessage || undefined,
                responseSize: r.responseSize || undefined
            }
        }));

        // 2. Aggregate Summary
        const summaryQuery = `
            SELECT
                count() as total,
                min(timestamp) as firstSeen,
                max(timestamp) as lastSeen,
                groupUniqArray(ip) as uniqueIps
            FROM logs
            WHERE ${timeRange} AND uid = '${uid}'
        `;

        const topActionsQuery = `
            SELECT 
                concat(method, ' ', url) as action,
                count() as count
            FROM logs
            WHERE ${timeRange} AND uid = '${uid}'
            GROUP BY action
            ORDER BY count DESC
            LIMIT 5
        `;

        const [summaryRes, actionsRes] = await Promise.all([
            client.query({ query: summaryQuery, format: 'JSONEachRow' }).then(r => r.json()),
            client.query({ query: topActionsQuery, format: 'JSONEachRow' }).then(r => r.json())
        ]);

        const summaryData = summaryRes[0] || {};
        const ips = summaryData.uniqueIps || [];

        const summary = {
            total: Number(summaryData.total || 0),
            firstSeen: summaryData.firstSeen,
            lastSeen: summaryData.lastSeen,
            ips: ips,
            topActions: actionsRes.map(r => ({ action: r.action, count: Number(r.count) }))
        };

        res.json({
            uid,
            timeline,
            summary
        });
    } catch (error) {
        console.error('User Activity Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Suspicious Activity
const getSuspiciousActivity = async (req, res) => {
    try {
        const client = getClient();
        const timeRange = getTimeRangeSQL(req.query, 7 * 24); // Default 7d

        // 1. Brute Force Detection (High 401/403)
        // Look for IPs with > 20 failures
        const bruteForceQuery = `
            SELECT 
                ip as actor,
                count() as count,
                max(timestamp) as lastSeen,
                groupUniqArray(uid) as uids,
                argMax(userAgent, timestamp) as lastUserAgent
            FROM logs
            WHERE ${timeRange} AND status IN (401, 403) AND ip != ''
            GROUP BY ip
            HAVING count > 20
            ORDER BY count DESC
            LIMIT 50
        `;

        // 2. High Error Rate (Status >= 400)
        // Look for IPs with > 50 requests where > 50% are errors
        const errorRateQuery = `
            SELECT 
                ip as actor,
                count() as total,
                countIf(status >= 400) as errors,
                max(timestamp) as lastSeen,
                groupUniqArray(uid) as uids,
                argMax(userAgent, timestamp) as lastUserAgent
            FROM logs
            WHERE ${timeRange} AND ip != ''
            GROUP BY ip
            HAVING total > 50 AND (errors / total) > 0.5
            ORDER BY errors DESC
            LIMIT 50
        `;

        // 3. Potential DoS (High Request Volume)
        // Look for IPs with > 1000 requests
        const dosQuery = `
            SELECT 
                ip as actor,
                count() as count,
                max(timestamp) as lastSeen,
                groupUniqArray(uid) as uids,
                argMax(userAgent, timestamp) as lastUserAgent
            FROM logs
            WHERE ${timeRange} AND ip != ''
            GROUP BY ip
            HAVING count > 1000
            ORDER BY count DESC
            LIMIT 20
        `;

        const [bfRes, erRes, dosRes] = await Promise.all([
            client.query({ query: bruteForceQuery, format: 'JSONEachRow' }).then(r => r.json()),
            client.query({ query: errorRateQuery, format: 'JSONEachRow' }).then(r => r.json()),
            client.query({ query: dosQuery, format: 'JSONEachRow' }).then(r => r.json())
        ]);

        const alerts = [];

        // Process Brute Force
        bfRes.forEach(row => {
            alerts.push({
                type: 'brute_force',
                severity: 'high',
                actor: row.actor,
                count: Number(row.count),
                description: `High number of authentication failures (${row.count}).`,
                lastSeen: row.lastSeen,
                uids: row.uids || [],
                userAgent: row.lastUserAgent || ''
            });
        });

        // Process Error Rate
        erRes.forEach(row => {
            // Avoid duplicates if already caught by brute force (simple check)
            if (alerts.some(a => a.type === 'brute_force' && a.actor === row.actor)) return;

            const rate = Math.round((Number(row.errors) / Number(row.total)) * 100);
            alerts.push({
                type: 'high_error_rate',
                severity: 'medium',
                actor: row.actor,
                count: Number(row.errors),
                description: `${rate}% error rate (${row.errors}/${row.total} requests failed).`,
                lastSeen: row.lastSeen,
                uids: row.uids || [],
                userAgent: row.lastUserAgent || ''
            });
        });

        // Process DoS
        dosRes.forEach(row => {
            // Avoid duplicates
            if (alerts.some(a => a.actor === row.actor)) return;

            alerts.push({
                type: 'potential_dos',
                severity: 'medium',
                actor: row.actor,
                count: Number(row.count),
                description: `Abnormally high request volume (${row.count} requests).`,
                lastSeen: row.lastSeen,
                uids: row.uids || [],
                userAgent: row.lastUserAgent || ''
            });
        });

        res.json(alerts);
    } catch (error) {
        console.error('Suspicious Activity Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getUidDirectory = async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const limitVal = Number(limit);

        const client = getClient();
        const timeRange = getTimeRangeSQL(req.query, 7 * 24); // Default 7d
        const whereConditions = buildWhereClause(req.query);

        const whereClause = whereConditions.length > 0
            ? `${timeRange} AND ${whereConditions.join(' AND ')}`
            : timeRange;

        // Count events per UID to sort by most active
        const query = `
            SELECT 
                uid,
                count() as count
            FROM logs
            WHERE ${whereClause} AND uid != ''
            GROUP BY uid
            ORDER BY count DESC
            LIMIT ${limitVal}
        `;

        const result = await client.query({ query, format: 'JSONEachRow' });
        const rows = await result.json();

        const results = rows.map(r => ({
            uid: r.uid,
            count: Number(r.count)
        }));

        res.json(results);
    } catch (error) {
        console.error('UID Directory Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Start Precompute - No-op for ClickHouse
const startOverviewPrecompute = () => { };
const startApplicationsPrecompute = () => { };

module.exports = {
    getOverviewStats,
    startOverviewPrecompute,
    startApplicationsPrecompute,
    searchLogs,
    getUserActivity,
    getSuspiciousActivity,
    getApplicationOverview,
    getUidDirectory
};
