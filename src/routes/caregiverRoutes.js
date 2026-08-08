const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const caregiverController = require('../controllers/caregiverController');

router.post('/tasks/:elderlyId', verifyToken, caregiverController.createTask);
router.get('/tasks/:elderlyId', verifyToken, caregiverController.getCareTasks); // Fixed 404 Error
router.post('/medications', verifyToken, caregiverController.scheduleMedication);
router.post('/health', verifyToken, caregiverController.recordHealth);
router.post('/reports', verifyToken, caregiverController.submitCareReport);
router.get('/assigned-patients', verifyToken, caregiverController.getAssignedPatients);
router.put('/tasks/:taskId/status', verifyToken, caregiverController.updateTaskStatus);

module.exports = router;