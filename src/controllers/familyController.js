const db = require('../config/db');
const crypto = require('crypto');

// 1. Monitor Care Tasks Progress for Elderly (cite: 2)
exports.getCareTasks = async (req, res) => {
  const { patientId } = req.params;

  try {
    const query = `
      SELECT Id, Title, Description, Status, DueDate, CreatedBy, DatetimeCreated 
      FROM Tasks 
      WHERE AssignedTo = ? 
      ORDER BY DatetimeCreated DESC
    `;
    const [tasks] = await db.query(query, [patientId]);
    return res.status(200).json({ tasks });
  } catch (err) {
    console.error("Get Care Tasks Error:", err);
    return res.status(500).json({ error: "Failed to fetch care tasks" });
  }
};

// 2. View Health Vitals and Rule-Based Alerts (cite: 2)
exports.getHealthRecords = async (req, res) => {
  const { patientId } = req.params;

  try {
    const query = `
      SELECT Id, HeartRate, BloodPressure, BloodSugar, Notes, CreatedBy, DatetimeCreated 
      FROM HealthRecords 
      WHERE PatientId = ? 
      ORDER BY DatetimeCreated DESC
    `;
    const [records] = await db.query(query, [patientId]);

    // Process rule-based alerts on retrieved records for family visibility (cite: 2)
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

// 3. View Daily Care Reports with Photo Evidence (cite: 2)
exports.getCareReports = async (req, res) => {
  const { patientId } = req.params;

  try {
    const query = `
      SELECT Id, HealthStatusNotes, DailyActivities, Observations, PhotoUrl, CreatedBy, DatetimeCreated 
      FROM CareReports 
      WHERE PatientId = ? 
      ORDER BY DatetimeCreated DESC
    `;
    const [reports] = await db.query(query, [patientId]);
    return res.status(200).json({ reports });
  } catch (err) {
    console.error("Get Care Reports Error:", err);
    return res.status(500).json({ error: "Failed to fetch care reports" });
  }
};

// 4. View Elderly Daily Mood Logs (cite: 2)
exports.getElderlyMoods = async (req, res) => {
  const { patientId } = req.params;

  try {
    const query = `
      SELECT Id, Mood, DatetimeCreated 
      FROM DailyMoods 
      WHERE ElderlyId = ? 
      ORDER BY DatetimeCreated DESC
    `;
    const [moods] = await db.query(query, [patientId]);
    return res.status(200).json({ moods });
  } catch (err) {
    console.error("Get Elderly Moods Error:", err);
    return res.status(500).json({ error: "Failed to fetch elderly mood history" });
  }
};


// POST /api/family/consume-pairing-code
exports.linkFamilyByCode = async (req, res) => {
  const familyMemberId = req.user.userId; // Extracted from JWT Bearer Token
  const { code, relationship } = req.body; // e.g. 'FAM-4921'

  try {
    // 1. Validate Pairing Code
    const [codes] = await db.execute(
      'SELECT * FROM PairingCodes WHERE Code = ? AND IsUsed = FALSE AND ExpiresAt > NOW()',
      [code]
    );

    if (codes.length === 0) {
      return res.status(400).json({ error: "Invalid or expired family pairing code." });
    }

    const pairingRecord = codes[0];
    const elderlyId = pairingRecord.ElderlyId;
    const linkId = uuidv4(); // GUID PK

    // 2. Insert into FamilyElderlyLinks with Mandatory Audit Columns
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
      familyMemberId, // CreatedBy
      familyMemberId  // UpdatedBy
    ]);

    // 3. Mark Code as Used
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

// 5. Fetch List of Linked Seniors for Family Member
exports.getLinkedElderly = async (req, res) => {
  const familyMemberId = req.user.userId; // Extracted from JWT middleware

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