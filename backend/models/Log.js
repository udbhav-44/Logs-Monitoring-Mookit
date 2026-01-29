const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  sourceType: {
    type: String, // 'nginx', 'app', 'db'
    required: true,
    enum: ['nginx', 'app', 'db']
  },
  appInfo: {
    name: { type: String, required: true },
    vmId: { type: String, required: true }
  },
  rawMessage: {
    type: String,
    required: true
  },
  parsedData: {
    ip: { type: String, index: true },
    uid: { type: String, index: true },
    method: String,
    url: String,
    status: Number,
    course: String,
    responseSize: Number,
    referrer: String,
    userAgent: String,
    level: String, // for app logs (info, error, etc.)
    message: String // parsed message body for app logs
  }
}, { timestamps: true });

// Compound indexes for common queries
logSchema.index({ 'parsedData.uid': 1, timestamp: -1 });
logSchema.index({ 'parsedData.ip': 1, timestamp: -1 });
logSchema.index({ sourceType: 1, timestamp: -1 });
logSchema.index({ 'parsedData.status': 1, timestamp: -1 });
logSchema.index({ 'parsedData.course': 1, timestamp: -1 });
logSchema.index({ 'appInfo.name': 1, timestamp: -1 });
logSchema.index({ 'appInfo.vmId': 1, timestamp: -1 });
logSchema.index(
  { rawMessage: 'text', 'parsedData.message': 'text', 'parsedData.url': 'text' },
  { weights: { 'parsedData.message': 5, 'parsedData.url': 3, rawMessage: 1 } }
);

module.exports = mongoose.model('Log', logSchema);
