const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Helper to generate a random 6-character invitation code (e.g. HC-8921 or FAM-4921)
function generateRandomCode(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${result}`;
}

/**
 * 1. POST /api/pairing/generate
 * Called by Elderly user to create a temporary 24-hour pairing code
 */
exports.generateCode = async (req, res) => {
  const elderlyGuid = req.user.userId; // Extracted from JWT Bearer token
  const { roleTarget } = req.body;      // 'caregiver' or 'family'

  try {
    const prefix = roleTarget === 'family' ? 'FAM' : 'HC';
    const code = generateRandomCode(prefix);
    const codeGuid = uuidv4();
    
    // Code expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const query = `
      INSERT INTO PairingCodes 
      (Id, ElderlyId, Code, RoleTarget, IsUsed, ExpiresAt, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, ?, FALSE, ?, ?, ?)
    `;

    await db.execute(query, [
      codeGuid,
      elderlyGuid,
      code,
      roleTarget || 'caregiver',
      expiresAt,
      elderlyGuid, // CreatedBy
      elderlyGuid  // UpdatedBy
    ]);

    return res.status(201).json({
      message: "Pairing code generated successfully",
      code: code,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error("Generate Code Error:", error);
    return res.status(500).json({ error: "Failed to generate pairing code." });
  }
};

/**
 * 2. POST /api/pairing/consume
 * Called by Caregiver to redeem pairing code and create assignment link
 */
exports.consumeCode = async (req, res) => {
  const caregiverId = req.user.userId; // Extracted from JWT Bearer token
  const { code } = req.body;

  try {
    const [rows] = await db.execute(
      'SELECT * FROM PairingCodes WHERE Code = ? AND IsUsed = FALSE AND ExpiresAt > NOW()',
      [code]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired pairing code." });
    }

    const pairingRecord = rows[0];
    const elderlyId = pairingRecord.ElderlyId;
    const assignmentId = uuidv4();

    // 1. Create Caregiver Assignment link with Mandatory Audit Columns
    await db.execute(
      `INSERT INTO CaregiverAssignments (Id, CaregiverId, ElderlyId, Status, CreatedBy, UpdatedBy)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
      [assignmentId, caregiverId, elderlyId, caregiverId, caregiverId]
    );

    // 2. Mark Pairing Code as Used
    await db.execute(
      'UPDATE PairingCodes SET IsUsed = TRUE, UpdatedBy = ? WHERE Id = ?',
      [caregiverId, pairingRecord.Id]
    );

    return res.status(200).json({ message: "Successfully paired with senior!", assignmentId });
  } catch (error) {
    console.error("Consume Code Error:", error);
    return res.status(500).json({ error: "Failed to process pairing code." });
  }
};