const express = require('express');  
const router = express.Router();  
const verifyToken = require('../middleware/authMiddleware');  
const familyController = require('../controllers/familyController');  

router.get('/tasks/:elderlyId', verifyToken, familyController.getCareTasks);  
router.post('/tasks/:elderlyId', verifyToken, familyController.createTask);  
router.put('/tasks/:taskId', verifyToken, familyController.editTask); // EDIT
router.put('/tasks/:taskId/status', verifyToken, familyController.updateTaskStatus);  

router.get('/health/:elderlyId/prediction', verifyToken, familyController.getHealthPrediction);
router.get('/health/:elderlyId', verifyToken, familyController.getHealthRecords);

router.get('/reports/:elderlyId', verifyToken, familyController.getCareReports);  
router.post('/reports/:reportId/acknowledge', verifyToken, familyController.acknowledgeReport); 

router.get('/moods/:elderlyId', verifyToken, familyController.getElderlyMoods);  

router.post('/consume-code', verifyToken, familyController.linkFamilyByCode);  
router.get('/linked-elderly', verifyToken, familyController.getLinkedElderly);  

module.exports = router;
