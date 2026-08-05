const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// POST /api/users/register
router.post('/register', userController.registerUser);

// POST /api/users/login
router.post('/login', userController.loginUser);

/**
 * 1. PUT /api/user/profile
 * Updates user profile details (Name, Phone Number, Gender, Profile Photo URL)
 * Automatically populates UpdatedBy and DatetimeUpdated audit columns
 */
router.put('/profile', verifyToken, userController.updateUserProfile);

/**
 * 2. POST /api/user/change-password
 * Verifies current password and sets new password hash
 * Automatically populates UpdatedBy and DatetimeUpdated audit columns
 */
router.post('/change-password', verifyToken, userController.changePassword);

/**
 * 3. GET /api/user/care-connections
 * Fetches care team connections (Caregivers and Family Members)
 * Requires ?elderlyId= query parameter for Caregiver/Family roles
 */
router.get('/care-connections', verifyToken, userController.getCareConnections);

/**
 * 4. DELETE /api/user/care-connections/:connectionId
 * Removes a care connection while strictly enforcing role privileges:
 * - Elderly: Can delete ANY connection linked to their profile
 * - Family: Can delete Caregivers and remove themselves
 * - Caregiver: Can ONLY remove themselves
 */
router.delete('/care-connections/:connectionId', verifyToken, userController.deleteCareConnection);


module.exports = router;