const mongoose = require('mongoose');

const connectDB = async () => {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/log-monitoring';
    try {
        await mongoose.connect(uri, {
            dbName: process.env.MONGO_DB || undefined,
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log(`MongoDB connected at ${uri}`);
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
