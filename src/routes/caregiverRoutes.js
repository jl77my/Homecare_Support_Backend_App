const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const caregiverController = require('../controllers/caregiverController');

router.post('/tasks', verifyToken, caregiverController.createTask);
router.post('/medications', verifyToken, caregiverController.scheduleMedication);
router.post('/health', verifyToken, caregiverController.recordHealth);
router.post('/reports', verifyToken, caregiverController.submitCareReport);
router.get('/assigned-patients', verifyToken, caregiverController.getAssignedPatients);

module.exports = router;