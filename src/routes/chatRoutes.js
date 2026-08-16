const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const verifyToken = require('../middleware/authMiddleware');


// Get isolated messages for a senior channel
router.get('/messages/:elderlyId', verifyToken, chatController.getChannelMessages);

// Get unread message counts for every channel available to the logged-in user
router.get('/unread-counts', verifyToken, chatController.getUnreadCounts);

// Persist the latest message viewed by the logged-in user in this channel
router.post('/messages/:elderlyId/read', verifyToken, chatController.markChannelAsRead);

// Send message to channel
router.post('/send', verifyToken, chatController.sendMessage);

module.exports = router;
