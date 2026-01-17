const express = require('express');
const router = express.Router();
const { ingestLogs } = require('../controllers/ingestController');

router.post('/', ingestLogs);

module.exports = router;
