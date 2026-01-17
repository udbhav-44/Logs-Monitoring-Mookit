const Datastore = require('nedb-promises');
const path = require('path');

const getValueByPath = (obj, pathStr) => {
    if (!pathStr || typeof pathStr !== 'string') return undefined;
    return pathStr.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
};

const hasOperator = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj instanceof Date) return false;
    return ['$gte', '$gt', '$lte', '$lt', '$exists', '$in', '$regex'].some(op => Object.prototype.hasOwnProperty.call(obj, op));
};

const matchesCondition = (value, condition) => {
    if (hasOperator(condition)) {
        if (condition.$exists !== undefined) {
            return condition.$exists ? value !== undefined : value === undefined;
        }
        if (condition.$in) {
            return condition.$in.includes(value);
        }
        if (condition.$regex) {
            const regex = new RegExp(condition.$regex, condition.$options || 'i');
            return regex.test(value || '');
        }
        if (condition.$gte !== undefined && (value === undefined || value < condition.$gte)) return false;
        if (condition.$gt !== undefined && (value === undefined || value <= condition.$gt)) return false;
        if (condition.$lte !== undefined && (value === undefined || value > condition.$lte)) return false;
        if (condition.$lt !== undefined && (value === undefined || value >= condition.$lt)) return false;
        return true;
    }
    return value === condition;
};

const matchesQuery = (doc, query = {}) => {
    return Object.entries(query).every(([key, condition]) => {
        if (key === '$or' && Array.isArray(condition)) {
            return condition.some(sub => matchesQuery(doc, sub));
        }
        if (key === '$and' && Array.isArray(condition)) {
            return condition.every(sub => matchesQuery(doc, sub));
        }
        const value = key.includes('.') ? getValueByPath(doc, key) : doc[key];
        return matchesCondition(value, condition);
    });
};

const evaluateExpression = (doc, expr) => {
    if (expr === undefined || expr === null) return expr;
    if (typeof expr === 'string') {
        return expr.startsWith('$') ? getValueByPath(doc, expr.slice(1)) : expr;
    }
    if (typeof expr === 'object') {
        if (expr.$hour) {
            const d = new Date(evaluateExpression(doc, expr.$hour));
            return Number.isNaN(d) ? undefined : d.getHours();
        }
        if (expr.$minute) {
            const d = new Date(evaluateExpression(doc, expr.$minute));
            return Number.isNaN(d) ? undefined : d.getMinutes();
        }
        if (expr.$dateToString) {
            const dateVal = new Date(evaluateExpression(doc, expr.$dateToString.date));
            if (Number.isNaN(dateVal)) return undefined;
            const pad = (n) => String(n).padStart(2, '0');
            const y = dateVal.getFullYear();
            const m = pad(dateVal.getMonth() + 1);
            const d = pad(dateVal.getDate());
            const h = pad(dateVal.getHours());
            const min = pad(dateVal.getMinutes());
            const s = pad(dateVal.getSeconds());
            const format = expr.$dateToString.format || '%Y-%m-%dT%H:%M:%S';
            return format
                .replace('%Y', y)
                .replace('%m', m)
                .replace('%d', d)
                .replace('%H', h)
                .replace('%M', min)
                .replace('%S', s);
        }
    }
    return expr;
};

const applySort = (docs, sortObj = {}) => {
    const sortKeys = Object.keys(sortObj);
    if (!sortKeys.length) return docs;
    return docs.sort((a, b) => {
        for (const key of sortKeys) {
            const dir = sortObj[key];
            const aVal = getValueByPath(a, key.startsWith('$') ? key.slice(1) : key);
            const bVal = getValueByPath(b, key.startsWith('$') ? key.slice(1) : key);
            if (aVal === bVal) continue;
            return (aVal > bVal ? 1 : -1) * dir;
        }
        return 0;
    });
};

const applyGroup = (docs, groupSpec) => {
    const groups = new Map();

    docs.forEach(doc => {
        const keyVal = evaluateExpression(doc, groupSpec._id);
        const mapKey = JSON.stringify(keyVal ?? null);
        if (!groups.has(mapKey)) {
            groups.set(mapKey, { _id: keyVal });
        }
        const bucket = groups.get(mapKey);

        Object.entries(groupSpec).forEach(([field, accumulator]) => {
            if (field === '_id') return;
            if (accumulator.$sum !== undefined) {
                const addVal = accumulator.$sum === 1 ? 1 : Number(evaluateExpression(doc, accumulator.$sum) || 0);
                bucket[field] = (bucket[field] || 0) + addVal;
            } else if (accumulator.$max !== undefined) {
                const val = evaluateExpression(doc, accumulator.$max);
                bucket[field] = bucket[field] === undefined ? val : (val > bucket[field] ? val : bucket[field]);
            } else if (accumulator.$min !== undefined) {
                const val = evaluateExpression(doc, accumulator.$min);
                bucket[field] = bucket[field] === undefined ? val : (val < bucket[field] ? val : bucket[field]);
            } else if (accumulator.$push !== undefined) {
                const val = evaluateExpression(doc, accumulator.$push);
                bucket[field] = [...(bucket[field] || []), val];
            } else if (accumulator.$addToSet !== undefined) {
                const val = evaluateExpression(doc, accumulator.$addToSet);
                const existing = bucket[field] || [];
                if (!existing.includes(val)) {
                    bucket[field] = [...existing, val];
                }
            }
        });
    });

    return Array.from(groups.values());
};

const applyProject = (docs, projection) => {
    return docs.map(doc => {
        const projected = {};
        Object.entries(projection).forEach(([field, rule]) => {
            if (rule === 0) return;
            if (rule === 1) {
                projected[field] = doc[field];
            } else if (typeof rule === 'string') {
                projected[field] = evaluateExpression(doc, rule);
            } else if (typeof rule === 'object') {
                projected[field] = evaluateExpression(doc, rule);
            }
        });
        return projected;
    });
};

class DB {
    constructor() {
        this.db = Datastore.create({
            filename: path.join(__dirname, '../../data.db'),
            autoload: true,
            timestampData: true
        });
    }

    async insertMany(docs) {
        const normalized = docs.map(doc => ({
            ...doc,
            timestamp: doc.timestamp ? new Date(doc.timestamp) : new Date()
        }));
        return this.db.insert(normalized);
    }

    async countDocuments(query) {
        return this.db.count(query);
    }

    async find(query = {}, options = {}) {
        let docs = await this.db.find(query);
        docs = docs.filter(doc => matchesQuery(doc, query));

        if (options.sort) {
            docs = applySort(docs, options.sort);
        }
        if (options.skip) {
            docs = docs.slice(options.skip);
        }
        if (options.limit) {
            docs = docs.slice(0, options.limit);
        }
        return docs;
    }

    async aggregate(pipeline = []) {
        let docs = await this.db.find({});

        for (const stage of pipeline) {
            if (stage.$match) {
                docs = docs.filter(doc => matchesQuery(doc, stage.$match));
            } else if (stage.$group) {
                docs = applyGroup(docs, stage.$group);
            } else if (stage.$sort) {
                docs = applySort(docs, stage.$sort);
            } else if (stage.$limit) {
                docs = docs.slice(0, stage.$limit);
            } else if (stage.$project) {
                docs = applyProject(docs, stage.$project);
            }
        }

        return docs;
    }
}

// Singleton for simplicity
const dbInstance = new DB();

const LogModel = {
    insertMany: (docs) => dbInstance.insertMany(docs),
    find: (query, options) => dbInstance.find(query, options),
    countDocuments: (query) => dbInstance.countDocuments(query),
    aggregate: (pipeline) => dbInstance.aggregate(pipeline)
};

module.exports = LogModel;
