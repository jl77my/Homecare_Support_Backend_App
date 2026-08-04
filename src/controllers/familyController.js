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

// 5. Send In-App Chat Message to Caregiver (cite: 2)
exports.sendMessage = async (req, res) => {
  const senderId = req.user.userId;
  const { receiverId, messageText } = req.body;
  const id = crypto.randomUUID();

  try {
    const query = `
      INSERT INTO Messages (Id, SenderId, ReceiverId, MessageText, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await db.query(query, [id, senderId, receiverId, messageText, senderId, senderId]);
    return res.status(201).json({ message: "Message sent to caregiver", messageId: id });
  } catch (err) {
    console.error("Send Message Error:", err);
    return res.status(500).json({ error: "Failed to send message" });
  }
};