const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatcontroller');
const verifyToken = require('../middleware/authMiddleware');


// Get isolated messages for a senior channel
router.get('/messages/:elderlyId', verifyToken, chatController.getChannelMessages);

// Send message to channel
router.post('/send', verifyToken, chatController.sendMessage);

module.exports = router;