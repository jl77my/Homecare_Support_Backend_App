// controllers/userController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { formatMySQLDate, getCurrentMalaysiaMySQLDate } = require('../helper/helper');

exports.registerUser = async (req, res) => {
    const { Name, Email, Password, Role } = req.body;
    if (!Name || !Email || !Password || !Role) {
        return res.status(400).json({ message: "All fields are required." });
    }
    const normalizedEmail = Email.trim().toLowerCase();
    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(Password, saltRounds);
        const newId = uuidv4();
        const timestamp = getCurrentMalaysiaMySQLDate();
        
        const query = `
            INSERT INTO Users (Id, Name, Email, Password, Role, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(query, [newId, Name, normalizedEmail, hashedPassword, Role, newId, timestamp, newId, timestamp]);
        res.status(201).json({
            message: "User registered successfully!",
            userId: newId
        });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
            return res.status(409).json({ message: "Email address is already registered." });
        }
        res.status(500).json({ message: "Server error during registration.", error: error.message });
    }
};

exports.loginUser = async (req, res) => {
    try {
        const { Email, Password } = req.body;
        const jwtSecret = process.env.JWT_SECRET;
        if (!Email || !Password) {
            return res.status(400).json({ error: 'Email and Password are required' });
        }
        if (!jwtSecret) {
            return res.status(500).json({ error: 'JWT secret is not configured' });
        }
        const normalizedEmail = Email.trim().toLowerCase();
        const [rows] = await db.execute('SELECT * FROM Users WHERE LOWER(Email) = ?', [normalizedEmail]);
        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid Email or Password" });
        }
        
        const user = rows[0];
        const isMatch = await bcrypt.compare(Password, user.Password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid Email or Password" });
        }
        
        const tokenPayload = {
            id: user.Id,
            email: user.Email,
            role: user.Role
        };
        const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '1h' });
        
        res.status(200).json({ 
            message: "Login successful", 
            token,
            user: {
                id: user.Id,
                name: user.Name,
                email: user.Email,
                role: user.Role,
                phoneNumber: user.PhoneNumber,       // NEW: Map to payload
                gender: user.Gender,                 // NEW: Map to payload
                profilePhotoUrl: user.ProfilePhotoUrl // NEW: Map to payload
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Login process failed" });
    }
};

exports.healthCheck = (req, res) => {
    res.status(200).json({ 
        message: "Backend is running",
        timestamp: new Date().toISOString()
    });
};

exports.updateUserProfile = async (req, res) => {
  const userId = req.user.userId; 
  const { name, phoneNumber, gender, profilePhotoUrl } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: "Full Name cannot be empty." });
  }
  try {
    const timestamp = getCurrentMalaysiaMySQLDate();
    const query = `
      UPDATE Users 
      SET Name = ?, PhoneNumber = ?, Gender = ?, ProfilePhotoUrl = ?, UpdatedBy = ?, DatetimeUpdated = ?
      WHERE Id = ?
    `;
    await db.execute(query, [name, phoneNumber || null, gender || null, profilePhotoUrl || null, userId, timestamp, userId]);
    return res.status(200).json({ message: "Profile updated successfully.", profilePhotoUrl });
  } catch (error) {
    console.error("Update Profile Error:", error);
    return res.status(500).json({ error: "Failed to update profile." });
  }
};

exports.changePassword = async (req, res) => {
  const userId = req.user.userId;
  const { currentPassword, newPassword } = req.body;
  try {
    const [rows] = await db.execute("SELECT Password FROM Users WHERE Id = ?", [userId]);
    if (rows.length === 0) return res.status(404).json({ error: "User not found." });
    
    const isMatch = await bcrypt.compare(currentPassword, rows[0].Password);
    if (!isMatch) return res.status(400).json({ error: "Current password is incorrect." });
    
    const newHash = await bcrypt.hash(newPassword, 10);
    const timestamp = getCurrentMalaysiaMySQLDate();
    
    await db.execute(
      "UPDATE Users SET Password = ?, UpdatedBy = ?, DatetimeUpdated = ? WHERE Id = ?",
      [newHash, userId, timestamp, userId]
    );
    return res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Change Password Error:", error);
    return res.status(500).json({ error: "Failed to change password." });
  }
};

exports.getCareConnections = async (req, res) => {
  const userId = req.user.userId;
  const userRole = req.user.role.toLowerCase();
  try {
    let elderlyId = userId;
    if (userRole !== 'elderly') {
      elderlyId = req.query.elderlyId;
      if (!elderlyId) return res.status(400).json({ error: "ElderlyId context is required." });
    }
    const query = `
      SELECT 
        c.Id AS ConnectionId,
        c.ElderlyId,
        c.ConnectedUserId,
        u.Name AS ConnectedUserName,
        u.Role AS ConnectedUserRole,
        c.Status
      FROM CareConnections c
      JOIN Users u ON c.ConnectedUserId = u.Id
      WHERE c.ElderlyId = ? AND c.Status = 'ACTIVE'
    `;
    const [rows] = await db.execute(query, [elderlyId]);
    
    let elderlyName = "Self";
    if (userRole !== 'elderly') {
      const [eRows] = await db.execute("SELECT Name FROM Users WHERE Id = ?", [elderlyId]);
      if (eRows.length > 0) elderlyName = eRows[0].Name;
    }
    return res.status(200).json({
      elderlyName,
      caregivers: rows.filter(r => r.ConnectedUserRole.toLowerCase() === 'caregiver'),
      familyMembers: rows.filter(r => r.ConnectedUserRole.toLowerCase() === 'family'),
    });
  } catch (error) {
    console.error("Get Connections Error:", error);
    return res.status(500).json({ error: "Failed to load care connections." });
  }
};

exports.deleteCareConnection = async (req, res) => {
  const requesterId = req.user.userId;
  const requesterRole = req.user.role.toLowerCase();
  const { connectionId } = req.params;
  try {
    const [rows] = await db.execute("SELECT * FROM CareConnections WHERE Id = ?", [connectionId]);
    if (rows.length === 0) return res.status(404).json({ error: "Connection not found." });
    
    const connection = rows[0];
    const targetUserId = connection.ConnectedUserId;
    const targetRole = connection.RoleType.toLowerCase();

    if (requesterRole === 'elderly' && connection.ElderlyId === requesterId) {
      await db.execute("DELETE FROM CareConnections WHERE Id = ?", [connectionId]);
      return res.status(200).json({ message: "Connection removed by Elderly owner." });
    }
    if (requesterRole === 'family') {
      if (targetRole === 'caregiver' || targetUserId === requesterId) {
        await db.execute("DELETE FROM CareConnections WHERE Id = ?", [connectionId]);
        return res.status(200).json({ message: "Connection removed by Family member." });
      }
      return res.status(403).json({ error: "Family members cannot remove other family members." });
    }
    if (requesterRole === 'caregiver') {
      if (targetUserId === requesterId) {
        await db.execute("DELETE FROM CareConnections WHERE Id = ?", [connectionId]);
        return res.status(200).json({ message: "Successfully left care team." });
      }
      return res.status(403).json({ error: "Caregivers can only remove themselves from a patient." });
    }
    return res.status(403).json({ error: "Unauthorized operation." });
  } catch (error) {
    console.error("Delete Connection Error:", error);
    return res.status(500).json({ error: "Failed to delete care connection." });
  }
};