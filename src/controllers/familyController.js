const db = require('../config/db');
const crypto = require('crypto');
const { formatMySQLDate, getCurrentMalaysiaMySQLDate } = require('../helper/helper');

exports.createTask = async (req, res) => {
  const familyMemberId = req.user.userId;
  const elderlyId = req.params.elderlyId; 
  const { title, description, dueDate } = req.body;
  const id = crypto.randomUUID();

  try {
    const currentTimestamp = getCurrentMalaysiaMySQLDate();
    const formattedDueDate = dueDate ? formatMySQLDate(dueDate) : currentTimestamp;

    const query = `
      INSERT INTO Tasks 
      (Id, Title, Description, Status, DueDate, AssignedTo, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?)
    `;
    
    await db.execute(query, [
      id, title, description || '', formattedDueDate, elderlyId, 
      familyMemberId, currentTimestamp, familyMemberId, currentTimestamp
    ]);

    return res.status(201).json({ message: "Task created successfully", taskId: id });
  } catch (err) {
    console.error("Create Task Error:", err);
    return res.status(500).json({ error: "Failed to create task" });
  }
};

exports.getCareTasks = async (req, res) => {
  const { elderlyId } = req.params;

  try {
    const query = `
      SELECT 
        Id, Title, Description, Status, DueDate, AssignedTo, 
        CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated 
      FROM Tasks 
      WHERE AssignedTo = ? 
      ORDER BY DatetimeCreated DESC
    `;
    const [tasks] = await db.execute(query, [elderlyId]);
    return res.status(200).json({ tasks });
  } catch (err) {
    console.error("Get Care Tasks Error:", err);
    return res.status(500).json({ error: "Failed to fetch care tasks" });
  }
};

exports.updateTaskStatus = async (req, res) => {
  const userId = req.user.userId;
  const { taskId } = req.params;
  const { status } = req.body; // 'Completed' or 'Pending'

  try {
    const { getCurrentMalaysiaMySQLDate } = require('../helper/helper');
    const timestamp = getCurrentMalaysiaMySQLDate();
    
    // Strictly enforcing audit columns
    const query = `
      UPDATE Tasks 
      SET Status = ?, UpdatedBy = ?, DatetimeUpdated = ? 
      WHERE Id = ?
    `;
    
    await db.execute(query, [status, userId, timestamp, taskId]);
    return res.status(200).json({ message: "Task status updated successfully" });
  } catch (err) {
    console.error("Update Task Error:", err);
    return res.status(500).json({ error: "Failed to update task status" });
  }
};

exports.getHealthRecords = async (req, res) => {
  const { elderlyId } = req.params;

  try {
    const query = `
      SELECT 
        Id, HeartRate, BloodPressure, BloodSugar, Notes, 
        CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated 
      FROM HealthRecords 
      WHERE ElderlyId = ? 
      ORDER BY DatetimeCreated DESC
    `;
    const [records] = await db.execute(query, [elderlyId]);

    const recordsWithAlerts = records.map(rec => {
      let alerts = [];
      if (rec.BloodPressure) {
        const parts = rec.BloodPressure.split('/');
        if (parts.length === 2) {
          const sys = parseInt(parts[0], 10);
          const dia = parseInt(parts[1], 10);
          if (sys >= 140 || dia >= 90) alerts.push("⚠️ High Blood Pressure Alert!");
        }
      }
      if (rec.HeartRate) {
        const hr = parseInt(rec.HeartRate, 10);
        if (hr > 100 || hr < 60) alerts.push("⚠️ Abnormal Heart Rate Alert!");
      }
      if (rec.BloodSugar) {
        const sugar = parseFloat(rec.BloodSugar);
        if (sugar > 11.0) alerts.push("⚠️ High Blood Glucose Alert!");
      }
      return { ...rec, alerts };
    });

    return res.status(200).json({ records: recordsWithAlerts });
  } catch (err) {
    console.error("Get Health Records Error:", err);
    return res.status(500).json({ error: "Failed to fetch health records" });
  }
};

exports.getCareReports = async (req, res) => {
  const { elderlyId } = req.params;

  try {
    const query = `
      SELECT 
        Id, HealthStatusNotes, DailyActivities, Observations, PhotoUrl, 
        CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated 
      FROM CareReports 
      WHERE ElderlyId = ? 
      ORDER BY DatetimeCreated DESC
    `;
    const [reports] = await db.execute(query, [elderlyId]);
    return res.status(200).json({ reports });
  } catch (err) {
    console.error("Get Care Reports Error:", err);
    return res.status(500).json({ error: "Failed to fetch care reports" });
  }
};

exports.getElderlyMoods = async (req, res) => {
  const { elderlyId } = req.params;

  try {
    const query = `
      SELECT 
        Id, Mood, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated 
      FROM DailyMoods 
      WHERE ElderlyId = ? 
      ORDER BY DatetimeCreated DESC
    `;
    const [moods] = await db.execute(query, [elderlyId]);
    return res.status(200).json({ moods });
  } catch (err) {
    console.error("Get Elderly Moods Error:", err);
    return res.status(500).json({ error: "Failed to fetch elderly mood history" });
  }
};

exports.linkFamilyByCode = async (req, res) => {
  const familyMemberId = req.user.userId;
  const { code, relationship } = req.body;

  try {
    const [codes] = await db.execute(
      'SELECT * FROM PairingCodes WHERE Code = ? AND IsUsed = FALSE AND ExpiresAt > NOW()',
      [code]
    );

    if (codes.length === 0) {
      return res.status(400).json({ error: "Invalid or expired family pairing code." });
    }

    const pairingRecord = codes[0];
    const elderlyId = pairingRecord.ElderlyId;
    const linkId = crypto.randomUUID();

    const query = `
      INSERT INTO FamilyElderlyLinks 
      (Id, FamilyMemberId, ElderlyId, Relationship, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    await db.execute(query, [
      linkId,
      familyMemberId,
      elderlyId,
      relationship || 'Family Member',
      familyMemberId,
      familyMemberId
    ]);

    await db.execute(
      'UPDATE PairingCodes SET IsUsed = TRUE, UpdatedBy = ? WHERE Id = ?',
      [familyMemberId, pairingRecord.Id]
    );

    return res.status(201).json({
      message: "Successfully linked to elderly patient!",
      linkId: linkId
    });
  } catch (error) {
    console.error("Family Pairing Error:", error);
    return res.status(500).json({ error: "Failed to process family pairing." });
  }
};

exports.getLinkedElderly = async (req, res) => {
  const familyMemberId = req.user.userId;

  try {
    const query = `
      SELECT 
        f.ElderlyId AS elderlyId,
        u.Name AS name,
        u.Email AS email,
        f.Relationship AS relationship,
        f.CreatedBy,
        f.DatetimeCreated,
        f.UpdatedBy,
        f.DatetimeUpdated
      FROM FamilyElderlyLinks f
      JOIN Users u ON f.ElderlyId = u.Id
      WHERE f.FamilyMemberId = ?
      ORDER BY f.DatetimeCreated DESC
    `;
    const [seniors] = await db.execute(query, [familyMemberId]);
    return res.status(200).json({ seniors });
  } catch (err) {
    console.error("Get Linked Elderly Error:", err);
    return res.status(500).json({ error: "Failed to fetch linked elderly list" });
  }
};