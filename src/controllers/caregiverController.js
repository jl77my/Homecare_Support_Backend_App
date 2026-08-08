const db = require('../config/db');
const crypto = require('crypto');
const { formatMySQLDate, getCurrentMalaysiaMySQLDate } = require('../helper/helper');

const evaluateHealthAlerts = (bloodPressure, heartRate, bloodSugar) => {
  let alerts = [];
  if (bloodPressure) {
    const parts = bloodPressure.split('/');
    if (parts.length === 2) {
      const sys = parseInt(parts[0], 10);
      const dia = parseInt(parts[1], 10);
      if (sys >= 140 || dia >= 90) alerts.push("⚠️ High Blood Pressure Alert!");
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

exports.createTask = async (req, res) => {
  const caregiverId = req.user.userId;
  const elderlyId = req.params.elderlyId; // FIX: Extract from URL parameter
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
    
    // Execute query securely with all 5 mandatory audit columns
    await db.execute(query, [
      id, title, description || '', formattedDueDate, elderlyId, 
      caregiverId, currentTimestamp, caregiverId, currentTimestamp
    ]);

    return res.status(201).json({ message: "Task assigned successfully", taskId: id });
  } catch (err) {
    console.error("Create Task Error:", err);
    return res.status(500).json({ error: "Failed to assign task" });
  }
};

exports.getCareTasks = async (req, res) => {
  const caregiverId = req.user.userId; 
  const { elderlyId } = req.params;

  try {
    const [assignmentCheck] = await db.execute(
      "SELECT Id FROM CaregiverAssignments WHERE CaregiverId = ? AND ElderlyId = ? AND Status = 'ACTIVE'",
      [caregiverId, elderlyId]
    );

    if (assignmentCheck.length === 0) {
      return res.status(403).json({ error: "Unauthorized: You are not assigned to this patient." });
    }

    const query = `
      SELECT 
        Id, Title, Description, Status, DueDate, 
        AssignedTo, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated
      FROM Tasks 
      WHERE AssignedTo = ? 
      ORDER BY DueDate ASC
    `;
    
    const [tasks] = await db.execute(query, [elderlyId]);
    return res.status(200).json({ tasks });
  } catch (err) {
    console.error("Get Care Tasks Error:", err);
    return res.status(500).json({ error: "Failed to fetch care tasks" });
  }
};

// Add to controllers/caregiverController.js
exports.updateTaskStatus = async (req, res) => {
  const userId = req.user.userId;
  const { taskId } = req.params;
  const { status } = req.body; // e.g., 'Completed'

  try {
    const currentTimestamp = getCurrentMalaysiaMySQLDate();
    
    // Strictly update the mandatory audit columns
    const query = `
      UPDATE Tasks 
      SET Status = ?, UpdatedBy = ?, DatetimeUpdated = ? 
      WHERE Id = ?
    `;
    
    await db.execute(query, [status, userId, currentTimestamp, taskId]);
    
    return res.status(200).json({ message: "Task status updated successfully" });
  } catch (err) {
    console.error("Update Task Error:", err);
    return res.status(500).json({ error: "Failed to update task status" });
  }
};


exports.scheduleMedication = async (req, res) => {
  const caregiverId = req.user.userId;
  const { patientId, medicationName, dosage, scheduledTime } = req.body;
  const id = crypto.randomUUID();

  try {
    const currentTimestamp = getCurrentMalaysiaMySQLDate();
    const query = `
      INSERT INTO Medications 
      (Id, PatientId, MedicationName, Dosage, ScheduledTime, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.execute(query, [
      id, patientId, medicationName, dosage, scheduledTime, 
      caregiverId, currentTimestamp, caregiverId, currentTimestamp
    ]);
    return res.status(201).json({ message: "Medication scheduled successfully", medicationId: id });
  } catch (err) {
    console.error("Schedule Medication Error:", err);
    return res.status(500).json({ error: "Failed to schedule medication" });
  }
};

exports.recordHealth = async (req, res) => {
  const caregiverId = req.user.userId;
  const { patientId, heartRate, bloodPressure, bloodSugar, notes } = req.body;
  const id = crypto.randomUUID();

  try {
    const currentTimestamp = getCurrentMalaysiaMySQLDate();
    const query = `
      INSERT INTO HealthRecords 
      (Id, PatientId, HeartRate, BloodPressure, BloodSugar, Notes, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.execute(query, [
      id, patientId, heartRate, bloodPressure, bloodSugar, notes || '', 
      caregiverId, currentTimestamp, caregiverId, currentTimestamp
    ]);

    const triggeredAlerts = evaluateHealthAlerts(bloodPressure, heartRate, bloodSugar);
    return res.status(201).json({ message: "Health record saved", recordId: id, alerts: triggeredAlerts });
  } catch (err) {
    console.error("Record Health Error:", err);
    return res.status(500).json({ error: "Failed to log health data" });
  }
};

exports.submitCareReport = async (req, res) => {
  const caregiverId = req.user.userId;
  const { patientId, healthStatusNotes, dailyActivities, observations, photoUrl } = req.body;
  const id = crypto.randomUUID();

  try {
    const currentTimestamp = getCurrentMalaysiaMySQLDate();
    const query = `
      INSERT INTO CareReports 
      (Id, PatientId, HealthStatusNotes, DailyActivities, Observations, PhotoUrl, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.execute(query, [
      id, patientId, healthStatusNotes, dailyActivities, observations, photoUrl || null, 
      caregiverId, currentTimestamp, caregiverId, currentTimestamp
    ]);
    return res.status(201).json({ message: "Care report submitted", reportId: id });
  } catch (err) {
    console.error("Submit Report Error:", err);
    return res.status(500).json({ error: "Failed to submit care report" });
  }
};

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