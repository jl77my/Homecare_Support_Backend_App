const db = require('../config/db');
const crypto = require('crypto');

// Helper: Rule-based evaluation for automated health alerts (cite: 107, 108)
const evaluateHealthAlerts = (bloodPressure, heartRate, bloodSugar) => {
  let alerts = [];
  if (bloodPressure) {
    const parts = bloodPressure.split('/');
    if (parts.length === 2) {
      const systolic = parseInt(parts[0], 10);
      const diastolic = parseInt(parts[1], 10);
      if (systolic >= 140 || diastolic >= 90) {
        alerts.push("⚠️ High Blood Pressure Alert!");
      }
    }
  }
  if (heartRate) {
    const hr = parseInt(heartRate, 10);
    if (hr > 100 || hr < 60) alerts.push("⚠️ Abnormal Heart Rate Alert!");
  }
  if (bloodSugar) {
    const sugar = parseFloat(bloodSugar);
    if (sugar > 11.0) alerts.push("⚠️ High Blood Glucose Alert!");
  }
  return alerts;
};

// 1. Assign Care Task (cite: 99)
exports.createTask = async (req, res) => {
  const caregiverId = req.user.userId;
  const { title, description, dueDate, assignedTo } = req.body;
  const id = crypto.randomUUID();

  try {
    const query = `
      INSERT INTO Tasks (Id, Title, Description, Status, DueDate, AssignedTo, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?)
    `;
    await db.query(query, [id, title, description, dueDate, assignedTo, caregiverId, caregiverId]);
    return res.status(201).json({ message: "Task assigned successfully", taskId: id });
  } catch (err) {
    console.error("Create Task Error:", err);
    return res.status(500).json({ error: "Failed to assign task" });
  }
};

// 2. Schedule Medication Reminder (cite: 104)
exports.scheduleMedication = async (req, res) => {
  const caregiverId = req.user.userId;
  const { patientId, medicationName, dosage, scheduledTime } = req.body;
  const id = crypto.randomUUID();

  try {
    const query = `
      INSERT INTO Medications (Id, PatientId, MedicationName, Dosage, ScheduledTime, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await db.query(query, [id, patientId, medicationName, dosage, scheduledTime, caregiverId, caregiverId]);
    return res.status(201).json({ message: "Medication scheduled successfully", medicationId: id });
  } catch (err) {
    console.error("Schedule Medication Error:", err);
    return res.status(500).json({ error: "Failed to schedule medication" });
  }
};

// 3. Record Vitals & Return Rule-Based Alerts (cite: 106, 107)
exports.recordHealth = async (req, res) => {
  const caregiverId = req.user.userId;
  const { patientId, heartRate, bloodPressure, bloodSugar, notes } = req.body;
  const id = crypto.randomUUID();

  try {
    const query = `
      INSERT INTO HealthRecords (Id, PatientId, HeartRate, BloodPressure, BloodSugar, Notes, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.query(query, [id, patientId, heartRate, bloodPressure, bloodSugar, notes, caregiverId, caregiverId]);

    const triggeredAlerts = evaluateHealthAlerts(bloodPressure, heartRate, bloodSugar);

    return res.status(201).json({
      message: "Health record saved",
      recordId: id,
      alerts: triggeredAlerts
    });
  } catch (err) {
    console.error("Record Health Error:", err);
    return res.status(500).json({ error: "Failed to log health data" });
  }
};

// 4. Submit Daily Care Report (cite: 109, 110)
exports.submitCareReport = async (req, res) => {
  const caregiverId = req.user.userId;
  const { patientId, healthStatusNotes, dailyActivities, observations, photoUrl } = req.body;
  const id = crypto.randomUUID();

  try {
    const query = `
      INSERT INTO CareReports (Id, PatientId, HealthStatusNotes, DailyActivities, Observations, PhotoUrl, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.query(query, [id, patientId, healthStatusNotes, dailyActivities, observations, photoUrl, caregiverId, caregiverId]);
    return res.status(201).json({ message: "Care report submitted", reportId: id });
  } catch (err) {
    console.error("Submit Report Error:", err);
    return res.status(500).json({ error: "Failed to submit care report" });
  }
};


// GET /api/caregiver/assigned-patients - Fetches dropdown list of assigned seniors
exports.getAssignedPatients = async (req, res) => {
  const caregiverId = req.user.userId;

  try {
    const query = `
      SELECT u.Id as id, u.Name as name, u.Email as email
      FROM Users u
      JOIN CaregiverAssignments ca ON u.Id = ca.ElderlyId
      WHERE ca.CaregiverId = ? AND ca.Status = 'ACTIVE'
    `;
    const [patients] = await db.execute(query, [caregiverId]);
    return res.status(200).json({ patients });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch assigned patients." });
  }
};