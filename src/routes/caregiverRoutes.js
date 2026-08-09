const express = require('express');  
const router = express.Router();  
const verifyToken = require('../middleware/authMiddleware');  
const caregiverController = require('../controllers/caregiverController');  

router.post('/tasks/:elderlyId', verifyToken, caregiverController.createTask);  
router.get('/tasks/:elderlyId', verifyToken, caregiverController.getCareTasks);  
router.put('/tasks/:taskId', verifyToken, caregiverController.editTask); // EDIT
router.put('/tasks/:taskId/status', verifyToken, caregiverController.updateTaskStatus);  

router.post('/medications', verifyToken, caregiverController.scheduleMedication);  
router.put('/medications/:medicationId', verifyToken, caregiverController.editMedication); // EDIT

router.get('/health/:elderlyId', verifyToken, caregiverController.getHealthRecords);  
router.post('/health', verifyToken, caregiverController.recordHealth);  

router.post('/reports', verifyToken, caregiverController.submitCareReport);  
router.get('/reports/:elderlyId', verifyToken, caregiverController.getCareReports); 
router.put('/reports/:reportId', verifyToken, caregiverController.editCareReport); // EDIT
router.delete('/reports/:reportId', verifyToken, caregiverController.deleteCareReport); // DELETE

router.get('/assigned-patients', verifyToken, caregiverController.getAssignedPatients);  

module.exports = router;