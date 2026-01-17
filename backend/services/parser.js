const monthMap = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

const parseNginxTimestamp = (timestampRaw) => {
    const match = timestampRaw.match(/(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})/);
    if (!match) return new Date();
    const [, day, mon, year, hour, minute, second, tz] = match;
    const month = monthMap[mon];
    if (!month) return new Date(timestampRaw);
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${tz.slice(0, 3)}:${tz.slice(3)}`;
    return new Date(iso);
};

const extractUidFromText = (text) => {
    if (!text) return null;
    const uidMatch = text.match(/(?:uid|user_id|userId|userid)[=:\"\s]+([A-Za-z0-9_-]+)/i);
    return uidMatch ? uidMatch[1] : null;
};

const extractIpFromText = (text) => {
    if (!text) return null;
    const ipMatch = text.match(/(\b\d{1,3}(?:\.\d{1,3}){3}\b)/);
    return ipMatch ? ipMatch[1] : null;
};

const parseNginxLog = (line) => {
    const regex = /^(\S+) - (\S+) \[([^\]]+)\] "([^"]+)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"/;
    const match = line.match(regex);
    if (!match) return null;

    const [, ip, user, timestampRaw, request, status, size, referrer, userAgent] = match;
    const [method, url] = request.split(' ');

    let uid = null;
    try {
        const urlObj = new URL(url.startsWith('http') ? url : `http://dummy${url}`);
        uid = urlObj.searchParams.get('uid') || urlObj.searchParams.get('user_id');
    } catch (e) {
        uid = extractUidFromText(url);
    }

    const timestamp = parseNginxTimestamp(timestampRaw);

    return {
        timestamp,
        parsedData: {
            ip,
            uid,
            method,
            url,
            status: parseInt(status, 10),
            responseSize: size === '-' ? 0 : parseInt(size, 10),
            referrer,
            userAgent,
            user: user !== '-' ? user : undefined
        }
    };
};

const parseAppLog = (line) => {
    const fallbackTimestamp = new Date();
    try {
        const jsonLog = typeof line === 'string' ? JSON.parse(line) : line;
        const parsedTs = jsonLog.timestamp ? new Date(jsonLog.timestamp) : fallbackTimestamp;
        return {
            timestamp: parsedTs,
            parsedData: {
                level: jsonLog.level || 'info',
                message: jsonLog.message || jsonLog.msg,
                uid: jsonLog.uid || jsonLog.userId || jsonLog.user_id,
                ip: jsonLog.ip || jsonLog.clientIp,
                method: jsonLog.method || jsonLog.httpMethod,
                url: jsonLog.url || jsonLog.path || jsonLog.endpoint,
                status: jsonLog.status || jsonLog.statusCode
            }
        };
    } catch (e) {
        const textMatch = line.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(.*)$/);
        const ts = textMatch ? new Date(textMatch[1]) : fallbackTimestamp;
        return {
            timestamp: ts,
            parsedData: {
                message: textMatch ? textMatch[2] : line
            }
        };
    }
};

const parseDbLog = (line) => {
    const match = line.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(.*)$/);
    const timestamp = match ? new Date(match[1]) : new Date();
    const message = match ? match[2] : line;
    const levelMatch = message.match(/\[(\w+)\]/);

    return {
        timestamp,
        parsedData: {
            level: levelMatch ? levelMatch[1].toLowerCase() : 'info',
            message,
            uid: extractUidFromText(message),
            ip: extractIpFromText(message)
        }
    };
};

const parseCustom = (rawMessage, parsingRules = {}, fallbackTimestamp = new Date()) => {
    if (!parsingRules.regex) return null;
    const regex = new RegExp(parsingRules.regex);
    const match = rawMessage.match(regex);
    if (!match || !match.groups) return null;

    const data = {};
    Object.entries(match.groups).forEach(([key, val]) => {
        if (['status', 'responseSize'].includes(key)) {
            data[key] = Number(val);
        } else {
            data[key] = val;
        }
    });

    return {
        timestamp: match.groups.timestamp ? new Date(match.groups.timestamp) : fallbackTimestamp,
        parsedData: data
    };
};

const parseLog = (logEntry) => {
    const { sourceType = logEntry.source || 'app', rawMessage, parsingRules } = logEntry;
    const baseTimestamp = logEntry.timestamp ? new Date(logEntry.timestamp) : new Date();

    let result = null;

    if (parsingRules) {
        result = parseCustom(rawMessage, parsingRules, baseTimestamp);
    }

    if (!result) {
        if (sourceType === 'nginx') {
            result = parseNginxLog(rawMessage);
        } else if (sourceType === 'db') {
            result = parseDbLog(rawMessage);
        } else {
            result = parseAppLog(rawMessage);
        }
    }

    if (!result) {
        return {
            timestamp: baseTimestamp,
            parsedData: { message: rawMessage }
        };
    }

    const mergedParsedData = { ...result.parsedData };
    if (!mergedParsedData.uid) mergedParsedData.uid = extractUidFromText(rawMessage);
    if (!mergedParsedData.ip) mergedParsedData.ip = extractIpFromText(rawMessage);
    if (mergedParsedData.status === undefined) {
        const statusMatch = rawMessage.match(/\b(\d{3})\b/);
        if (statusMatch) mergedParsedData.status = Number(statusMatch[1]);
    }

    return {
        timestamp: result.timestamp || baseTimestamp,
        parsedData: mergedParsedData
    };
};

module.exports = { parseLog };
