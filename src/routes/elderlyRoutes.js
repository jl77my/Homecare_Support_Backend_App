const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const elderlyController = require('../controllers/elderlyController');

// Elderly Role Endpoints
router.post('/medications/confirm', verifyToken, elderlyController.confirmMedication);
router.post('/mood', verifyToken, elderlyController.logMood);
router.post('/sos', verifyToken, elderlyController.triggerSos);
router.get('/medications', verifyToken, elderlyController.getMedications);
router.delete('/medications/:id', verifyToken, elderlyController.deleteMedication);

module.exports = router;