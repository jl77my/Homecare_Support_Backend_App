const express = require('express');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const agentRateLimit = require('../middleware/agentRateLimit');
const agentController = require('../controllers/agentController');

const router = express.Router();

router.use(verifyToken, requireRole('caregiver', 'family'), agentRateLimit);
router.post('/chat', agentController.chat);
router.post('/actions/confirm', agentController.confirmAction);

module.exports = router;
