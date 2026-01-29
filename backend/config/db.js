const mongoose = require('mongoose');

const connectDB = async () => {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/log-monitoring';
    const maxPoolSize = Number(process.env.MONGO_MAX_POOL_SIZE) || 50;
    const minPoolSize = Number(process.env.MONGO_MIN_POOL_SIZE) || 5;
    try {
        await mongoose.connect(uri, {
            dbName: process.env.MONGO_DB || undefined,
            maxPoolSize,
            minPoolSize
        });
        console.log(`MongoDB connected at ${uri}`);
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
