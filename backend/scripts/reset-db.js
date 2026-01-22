const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Log = require('../models/Log');

dotenv.config();

const resetDb = async () => {
    await connectDB();
    const result = await Log.deleteMany({});
    console.log(`Deleted ${result.deletedCount} logs.`);
    await mongoose.connection.close();
};

resetDb().catch((error) => {
    console.error('Failed to reset MongoDB:', error.message);
    process.exit(1);
});
