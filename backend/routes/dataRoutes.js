const express = require('express');
const router = express.Router();
const { deletePartition } = require('../controllers/dataController');

router.delete('/partition', deletePartition);

module.exports = router;
