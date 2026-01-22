const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const ingestRoutes = require('./routes/ingestRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

app.use('/api/ingest', ingestRoutes);
app.use('/api/analytics', analyticsRoutes);

// Routes placeholder
app.get('/', (req, res) => {
    res.send('API is running...');
});

console.log('Loaded PORT from env:', process.env.PORT);
const PORT = process.env.PORT || 5002;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});
