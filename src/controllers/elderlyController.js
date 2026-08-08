const db = require('../config/db');
const crypto = require('crypto');
const { getCurrentMalaysiaMySQLDate } = require('../helper/helper');

exports.confirmMedication = async (req, res) => {
  const patientId = req.user.userId;
  const { medicationId, status } = req.body;
  const id = crypto.randomUUID();

  try {
    const timestamp = getCurrentMalaysiaMySQLDate();
    const query = `
      INSERT INTO MedicationLogs (Id, MedicationId, PatientId, Status, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.execute(query, [id, medicationId, patientId, status || 'Taken', patientId, timestamp, patientId, timestamp]);
    return res.status(201).json({ message: "Medication confirmation logged successfully", logId: id });
  } catch (err) {
    console.error("Confirm Medication Error:", err);
    return res.status(500).json({ error: "Failed to confirm medication" });
  }
};

exports.logMood = async (req, res) => {
  const elderlyId = req.user.userId || req.user.id;
  const { mood } = req.body; 
  if (!mood) return res.status(400).json({ error: "Mood selection is required." });
  
  const id = crypto.randomUUID(); 
  try {
    const timestamp = getCurrentMalaysiaMySQLDate();
    const query = `
      INSERT INTO DailyMoods (Id, ElderlyId, Mood, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await db.execute(query, [id, elderlyId, mood, elderlyId, timestamp, elderlyId, timestamp]);
    return res.status(201).json({ message: "Daily mood recorded successfully", moodId: id });
  } catch (err) {
    console.error("Log Mood SQL Execution Error:", err);
    return res.status(500).json({ error: "Failed to log daily mood: " + err.message });
  }
};

exports.triggerSos = async (req, res) => {
  const elderlyId = req.user.userId;
  const id = crypto.randomUUID();

  try {
    const timestamp = getCurrentMalaysiaMySQLDate();
    const query = `
      INSERT INTO SosAlerts (Id, ElderlyId, Status, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, 'Active', ?, ?, ?, ?)
    `;
    await db.execute(query, [id, elderlyId, elderlyId, timestamp, elderlyId, timestamp]);
    return res.status(201).json({ message: "SOS Emergency Alert Sent!", alertId: id });
  } catch (err) {
    console.error("Trigger SOS Error:", err);
    return res.status(500).json({ error: "Failed to trigger SOS alert" });
  }
};

exports.getMedications = async (req, res) => {
  const elderlyId = req.user.userId;
  try {
    const query = `
      SELECT 
         Id, PatientId, MedicationName, Dosage, ScheduledTime, 
         CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated
      FROM Medications
      WHERE PatientId = ?
      ORDER BY ScheduledTime ASC
    `;
    const [medications] = await db.execute(query, [elderlyId]);
    return res.status(200).json({ medications });
  } catch (err) {
    console.error("Get Medications Error:", err);
    return res.status(500).json({ error: "Failed to fetch medications" });
  }
};