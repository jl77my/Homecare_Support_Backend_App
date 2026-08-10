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
                phoneNumber: user.PhoneNumber,       
                gender: user.Gender,                 
                profilePhotoUrl: user.ProfilePhotoUrl 
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
    let elderlyList = [];
    let caregivers = [];
    let familyMembers = [];

    if (userRole === 'elderly') {
      const [cg] = await db.execute(`
        SELECT ca.Id AS ConnectionId, ca.ElderlyId, ca.CaregiverId AS ConnectedUserId,
               u.Name AS ConnectedUserName, 'caregiver' AS ConnectedUserRole, COALESCE(ca.Status, 'ACTIVE') as Status
        FROM CaregiverAssignments ca
        JOIN Users u ON ca.CaregiverId = u.Id
        WHERE ca.ElderlyId = ? AND COALESCE(ca.Status, 'ACTIVE') = 'ACTIVE'
      `, [userId]);
      caregivers = cg;

      const [fm] = await db.execute(`
        SELECT fel.Id AS ConnectionId, fel.ElderlyId, fel.FamilyMemberId AS ConnectedUserId,
               u.Name AS ConnectedUserName, 'family' AS ConnectedUserRole, COALESCE(fel.Status, 'ACTIVE') as Status
        FROM FamilyElderlyLinks fel
        JOIN Users u ON fel.FamilyMemberId = u.Id
        WHERE fel.ElderlyId = ? AND COALESCE(fel.Status, 'ACTIVE') = 'ACTIVE'
      `, [userId]);
      familyMembers = fm;

    } else if (userRole === 'caregiver') {
      const [eld] = await db.execute(`
        SELECT ca.Id AS ConnectionId, ca.ElderlyId AS ConnectedUserId, 
               u.Name AS ConnectedUserName, 'elderly' AS ConnectedUserRole, COALESCE(ca.Status, 'ACTIVE') as Status
        FROM CaregiverAssignments ca 
        JOIN Users u ON ca.ElderlyId = u.Id
        WHERE ca.CaregiverId = ? AND COALESCE(ca.Status, 'ACTIVE') = 'ACTIVE'
      `, [userId]);
      elderlyList = eld;

      if (eld.length > 0) {
        const elderlyIds = eld.map(e => e.ConnectedUserId);
        const placeholders = elderlyIds.map(() => '?').join(',');
        const [fm] = await db.execute(`
          SELECT fel.Id AS ConnectionId, fel.ElderlyId, fel.FamilyMemberId AS ConnectedUserId,
                 u.Name AS ConnectedUserName, 'family' AS ConnectedUserRole, COALESCE(fel.Status, 'ACTIVE') as Status
          FROM FamilyElderlyLinks fel 
          JOIN Users u ON fel.FamilyMemberId = u.Id
          WHERE COALESCE(fel.Status, 'ACTIVE') = 'ACTIVE' AND fel.ElderlyId IN (${placeholders})
        `, elderlyIds);
        familyMembers = fm;
      }

    } else if (userRole === 'family') {
      const [eld] = await db.execute(`
        SELECT fel.Id AS ConnectionId, fel.ElderlyId AS ConnectedUserId, 
               u.Name AS ConnectedUserName, 'elderly' AS ConnectedUserRole, COALESCE(fel.Status, 'ACTIVE') as Status
        FROM FamilyElderlyLinks fel 
        JOIN Users u ON fel.ElderlyId = u.Id
        WHERE fel.FamilyMemberId = ? AND COALESCE(fel.Status, 'ACTIVE') = 'ACTIVE'
      `, [userId]);
      elderlyList = eld;

      if (eld.length > 0) {
        const elderlyIds = eld.map(e => e.ConnectedUserId);
        const placeholders = elderlyIds.map(() => '?').join(',');
        const [cg] = await db.execute(`
          SELECT ca.Id AS ConnectionId, ca.ElderlyId, ca.CaregiverId AS ConnectedUserId,
                 u.Name AS ConnectedUserName, 'caregiver' AS ConnectedUserRole, COALESCE(ca.Status, 'ACTIVE') as Status
          FROM CaregiverAssignments ca 
          JOIN Users u ON ca.CaregiverId = u.Id
          WHERE COALESCE(ca.Status, 'ACTIVE') = 'ACTIVE' AND ca.ElderlyId IN (${placeholders})
        `, elderlyIds);
        caregivers = cg;
      }
    }

    return res.status(200).json({
      elderlyList,
      caregivers,
      familyMembers
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
    const timestamp = getCurrentMalaysiaMySQLDate();
    
    const [cgRows] = await db.execute("SELECT * FROM CaregiverAssignments WHERE Id = ?", [connectionId]);
    if (cgRows.length > 0) {
      const conn = cgRows[0];
      if (requesterRole === 'elderly' || requesterRole === 'family' || (requesterRole === 'caregiver' && conn.CaregiverId === requesterId)) {
        await db.execute(
          "UPDATE CaregiverAssignments SET Status = 'REMOVED', UpdatedBy = ?, DatetimeUpdated = ? WHERE Id = ?", 
          [requesterId, timestamp, connectionId]
        );
        return res.status(200).json({ message: "Caregiver connection removed." });
      }
      return res.status(403).json({ error: "Unauthorized to remove this caregiver." });
    }

    const [famRows] = await db.execute("SELECT * FROM FamilyElderlyLinks WHERE Id = ?", [connectionId]);
    if (famRows.length > 0) {
      const conn = famRows[0];
      if (requesterRole === 'elderly' || (requesterRole === 'family' && conn.FamilyMemberId === requesterId)) {
        await db.execute(
          "UPDATE FamilyElderlyLinks SET Status = 'REMOVED', UpdatedBy = ?, DatetimeUpdated = ? WHERE Id = ?", 
          [requesterId, timestamp, connectionId]
        );
        return res.status(200).json({ message: "Family connection removed." });
      }
      return res.status(403).json({ error: "Family members cannot remove other family members." });
    }

    return res.status(404).json({ error: "Active connection not found." });
  } catch (error) {
    console.error("Delete Connection Error:", error);
    return res.status(500).json({ error: "Failed to remove care connection." });
  }
};