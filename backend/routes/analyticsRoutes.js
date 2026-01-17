const express = require('express');
const router = express.Router();
const { getOverviewStats, searchLogs, getUserActivity, getSuspiciousActivity, getApplicationOverview } = require('../controllers/analyticsController');

router.get('/overview', getOverviewStats);
router.get('/search', searchLogs);
router.get('/activity', getUserActivity);
router.get('/suspicious', getSuspiciousActivity);
router.get('/applications', getApplicationOverview);

module.exports = router;
