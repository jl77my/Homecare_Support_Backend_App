const db = require('../config/db');
const crypto = require('crypto');

// 1. Confirm Medication Intake (cite: 2)
exports.confirmMedication = async (req, res) => {
  const patientId = req.user.userId;
  const { medicationId, status } = req.body;
  const id = crypto.randomUUID();

  try {
    const query = `
      INSERT INTO MedicationLogs (Id, MedicationId, PatientId, Status, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await db.query(query, [id, medicationId, patientId, status || 'Taken', patientId, patientId]);
    return res.status(201).json({ message: "Medication confirmation logged successfully", logId: id });
  } catch (err) {
    console.error("Confirm Medication Error:", err);
    return res.status(500).json({ error: "Failed to confirm medication" });
  }
};

// 2. Log Daily Mood (cite: 2)
exports.logMood = async (req, res) => {
  // Extract authenticated user ID populated by JWT middleware
  const elderlyId = req.user.userId || req.user.id;
  const { mood } = req.body; // 'Happy', 'Neutral', or 'Sad'

  if (!mood) {
    return res.status(400).json({ error: "Mood selection is required." });
  }

  const id = crypto.randomUUID(); // GUID Primary Key

  try {
    const query = `
      INSERT INTO DailyMoods (Id, ElderlyId, Mood, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    // Use db.execute for mysql2 prepared statements
    await db.execute(query, [id, elderlyId, mood, elderlyId, elderlyId]);

    return res.status(201).json({ message: "Daily mood recorded successfully", moodId: id });
  } catch (err) {
    console.error("Log Mood SQL Execution Error:", err);
    return res.status(500).json({ error: "Failed to log daily mood: " + err.message });
  }
};

// 3. Trigger SOS Emergency Alert (cite: 2)
exports.triggerSos = async (req, res) => {
  const elderlyId = req.user.userId;
  const id = crypto.randomUUID();

  try {
    const query = `
      INSERT INTO SosAlerts (Id, ElderlyId, Status, CreatedBy, UpdatedBy)
      VALUES (?, ?, 'Active', ?, ?)
    `;
    await db.query(query, [id, elderlyId, elderlyId, elderlyId]);
    return res.status(201).json({ 
      message: "🚨 SOS Emergency Alert Sent!", 
      alertId: id 
    });
  } catch (err) {
    console.error("Trigger SOS Error:", err);
    return res.status(500).json({ error: "Failed to trigger SOS alert" });
  }
};