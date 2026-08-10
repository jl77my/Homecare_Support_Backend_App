// controllers/pairingController.js
const db = require('../config/db');
const crypto = require('crypto');
const { getCurrentMalaysiaMySQLDate, formatMySQLDate } = require('../helper/helper');

function generateRandomCode(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${result}`;
}

exports.generateCode = async (req, res) => {
  const elderlyGuid = req.user.userId;
  const { roleTarget } = req.body;
  try {
    const prefix = roleTarget === 'family' ? 'FAM' : 'HC';
    const code = generateRandomCode(prefix);
    const timestamp = getCurrentMalaysiaMySQLDate();
         
    const expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiresAt = formatMySQLDate(expirationDate);

    const invalidateQuery = `
      UPDATE PairingCodes 
      SET IsUsed = TRUE, UpdatedBy = ?, DatetimeUpdated = ? 
      WHERE ElderlyId = ? AND RoleTarget = ? AND IsUsed = FALSE
    `;
    await db.execute(invalidateQuery, [elderlyGuid, timestamp, elderlyGuid, roleTarget || 'caregiver']);

    const codeGuid = crypto.randomUUID();
    const insertQuery = `
      INSERT INTO PairingCodes 
      (Id, ElderlyId, Code, RoleTarget, IsUsed, ExpiresAt, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated) 
      VALUES (?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?)
    `;
    await db.execute(insertQuery, [
      codeGuid, elderlyGuid, code, roleTarget || 'caregiver', expiresAt,
      elderlyGuid, timestamp, elderlyGuid, timestamp
    ]);

    return res.status(201).json({ message: "Pairing code generated successfully", code: code, expiresAt: expiresAt });
  } catch (error) {
    console.error("Generate Code Error:", error);
    return res.status(500).json({ error: "Failed to generate pairing code." });
  }
}

exports.consumeCode = async (req, res) => {
  const caregiverId = req.user.userId;
  const { code } = req.body;

  // Obtain a dedicated database connection to handle the transaction
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. SELECT FOR UPDATE locks the specific row to prevent double consumption
    const [rows] = await connection.execute(
      'SELECT * FROM PairingCodes WHERE Code = ? AND IsUsed = FALSE AND ExpiresAt > NOW() FOR UPDATE',
      [code]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Invalid, expired, or already consumed pairing code." });
    }

    const pairingRecord = rows[0];
    const elderlyId = pairingRecord.ElderlyId;
    const assignmentId = crypto.randomUUID();
    const timestamp = getCurrentMalaysiaMySQLDate();

    // 2. Insert the assignment
    await connection.execute(
      `INSERT INTO CaregiverAssignments (Id, CaregiverId, ElderlyId, Status, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated) 
       VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
      [assignmentId, caregiverId, elderlyId, caregiverId, timestamp, caregiverId, timestamp]
    );

    // 3. Mark the code as consumed
    await connection.execute(
      'UPDATE PairingCodes SET IsUsed = TRUE, UpdatedBy = ?, DatetimeUpdated = ? WHERE Id = ?',
      [caregiverId, timestamp, pairingRecord.Id]
    );

    // Commit the transaction and release the lock
    await connection.commit();
    return res.status(200).json({ message: "Successfully paired with senior!", assignmentId });

  } catch (error) {
    await connection.rollback();
    console.error("Consume Code Error:", error);
    return res.status(500).json({ error: "Failed to process pairing code." });
  } finally {
    connection.release();
  }
};

exports.getPairingStatus = async (req, res) => {
  const elderlyId = req.user.userId;
  try {
    const [caregivers] = await db.execute("SELECT Id FROM CaregiverAssignments WHERE ElderlyId = ? AND Status = 'ACTIVE'", [elderlyId]);
    const [family] = await db.execute("SELECT Id FROM FamilyElderlyLinks WHERE ElderlyId = ? AND Status = 'ACTIVE'", [elderlyId]);
    
    const isLinked = caregivers.length > 0 || family.length > 0;
    return res.status(200).json({ isLinked });
  } catch (error) {
    console.error("Get Pairing Status Error:", error);
    return res.status(500).json({ error: "Failed to fetch pairing status." });
  }
};
