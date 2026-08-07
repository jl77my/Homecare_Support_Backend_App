const express = require('express');
const router = express.Router();
const pairingController = require('../controllers/pairingController');
const verifyToken = require('../middleware/authMiddleware');

// POST /api/pairing/generate - Called by Elderly to create a temporary pairing code
router.post('/generate', verifyToken, pairingController.generateCode);

// POST /api/pairing/consume - Called by Caregiver to redeem a 6-digit code and create assignment
router.post('/consume', verifyToken, pairingController.consumeCode);

// GET /api/pairing/status - Check if elderly account is linked
router.get('/status', verifyToken, pairingController.getPairingStatus);

module.exports = router;