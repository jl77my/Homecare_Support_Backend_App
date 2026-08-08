const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const familyController = require('../controllers/familyController');

// Family Member Endpoints (cite: 2)
router.get('/tasks/:elderlyId', verifyToken, familyController.getCareTasks);
router.post('/tasks/:elderlyId', verifyToken, familyController.createTask);
router.get('/health/:elderlyId', verifyToken, familyController.getHealthRecords);
router.get('/reports/:elderlyId', verifyToken, familyController.getCareReports);
router.get('/moods/:elderlyId', verifyToken, familyController.getElderlyMoods);
router.post('/consume-code', verifyToken, familyController.linkFamilyByCode);
router.get('/linked-elderly', verifyToken, familyController.getLinkedElderly);
router.put('/tasks/:taskId/status', verifyToken, familyController.updateTaskStatus);

module.exports = router;