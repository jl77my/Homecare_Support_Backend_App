const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const familyController = require('../controllers/familyController');

// Family Member Endpoints (cite: 2)
router.get('/tasks/:patientId', verifyToken, familyController.getCareTasks);
router.get('/health/:patientId', verifyToken, familyController.getHealthRecords);
router.get('/reports/:patientId', verifyToken, familyController.getCareReports);
router.get('/moods/:patientId', verifyToken, familyController.getElderlyMoods);
router.post('/chat', verifyToken, familyController.sendMessage);

module.exports = router;