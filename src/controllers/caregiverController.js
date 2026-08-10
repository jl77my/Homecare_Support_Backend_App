// controllers/caregiverController.js
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
            if (sys >= 140 || dia >= 90) alerts.push("High Blood Pressure Alert!");
        }
    }
    if (heartRate) {
        const hr = parseInt(heartRate, 10);
        if (hr > 100 || hr < 60) alerts.push("Abnormal Heart Rate Alert!");
    }
    if (bloodSugar) {
        const sugar = parseFloat(bloodSugar);
        if (sugar > 11.0) alerts.push("High Blood Glucose Alert!");
    }
    return alerts;
};

exports.createTask = async (req, res) => {
    const caregiverId = req.user.userId;
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
            caregiverId, currentTimestamp, caregiverId, currentTimestamp
        ]);
        return res.status(201).json({ message: "Task assigned successfully", taskId: id });
    } catch (err) {
        return res.status(500).json({ error: "Failed to assign task" });
    }
};

exports.editTask = async (req, res) => {
  const userId = req.user.userId;
  const { taskId } = req.params;
  const { title, description, dueDate } = req.body;
  try {
    const timestamp = getCurrentMalaysiaMySQLDate();
    const formattedDueDate = dueDate ? formatMySQLDate(dueDate) : timestamp;
    await db.execute(
      `UPDATE Tasks SET Title = ?, Description = ?, DueDate = ?, UpdatedBy = ?, DatetimeUpdated = ? WHERE Id = ?`,
      [title, description || '', formattedDueDate, userId, timestamp, taskId]
    );
    return res.status(200).json({ message: "Task updated successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update task" });
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
            SELECT Id, Title, Description, Status, DueDate, AssignedTo,
                   CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated 
            FROM Tasks 
            WHERE AssignedTo = ? 
            ORDER BY DueDate ASC
        `;
        const [tasks] = await db.execute(query, [elderlyId]);
        return res.status(200).json({ tasks });
    } catch (err) {
        return res.status(500).json({ error: "Failed to fetch care tasks" });
    }
};

exports.updateTaskStatus = async (req, res) => {
    const userId = req.user.userId;
    const { taskId } = req.params;
    const { status } = req.body;
    try {
        const currentTimestamp = getCurrentMalaysiaMySQLDate();
        const query = `
            UPDATE Tasks 
            SET Status = ?, UpdatedBy = ?, DatetimeUpdated = ? 
            WHERE Id = ?
        `;
        await db.execute(query, [status, userId, currentTimestamp, taskId]);
        return res.status(200).json({ message: "Task status updated successfully" });
    } catch (err) {
        return res.status(500).json({ error: "Failed to update task status" });
    }
};

exports.scheduleMedication = async (req, res) => {
    const caregiverId = req.user.userId;
    const { patientId, medicationName, dosage, scheduledDate, scheduledTime, category, frequency, notes } = req.body;
    const id = crypto.randomUUID();
    try {
        const currentTimestamp = getCurrentMalaysiaMySQLDate();
        const query = `
            INSERT INTO Medications 
            (Id, ElderlyId, MedicationName, Dosage, ScheduledDate, ScheduledTime, Category, Frequency, Notes, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(query, [
            id, patientId, medicationName, dosage || '', scheduledDate || null, scheduledTime,
            category || 'medication', frequency || 'daily', notes || '',
            caregiverId, currentTimestamp, caregiverId, currentTimestamp
        ]);
        return res.status(201).json({ message: "Medication scheduled successfully", medicationId: id });
    } catch (err) {
        return res.status(500).json({ error: "Failed to schedule medication" });
    }
};

exports.editMedication = async (req, res) => {
  const userId = req.user.userId;
  const { medicationId } = req.params;
  const { medicationName, dosage, scheduledDate, scheduledTime, category, frequency, notes } = req.body;
  try {
      const timestamp = getCurrentMalaysiaMySQLDate();
      await db.execute(
          `UPDATE Medications SET MedicationName=?, Dosage=?, ScheduledDate=?, ScheduledTime=?, Category=?, Frequency=?, Notes=?, UpdatedBy=?, DatetimeUpdated=? WHERE Id=?`,
          [medicationName, dosage||'', scheduledDate||null, scheduledTime, category||'medication', frequency||'daily', notes||'', userId, timestamp, medicationId]
      );
      return res.status(200).json({ message: "Medication updated successfully" });
  } catch (err) {
      return res.status(500).json({ error: "Failed to update medication" });
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
            (Id, ElderlyId, HeartRate, BloodPressure, BloodSugar, Notes, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(query, [
            id, patientId, heartRate, bloodPressure, bloodSugar, notes || '',
            caregiverId, currentTimestamp, caregiverId, currentTimestamp
        ]);
        const triggeredAlerts = evaluateHealthAlerts(bloodPressure, heartRate, bloodSugar);
        return res.status(201).json({ message: "Health record saved", recordId: id, alerts: triggeredAlerts });
    } catch (err) {
        return res.status(500).json({ error: "Failed to log health data" });
    }
};

exports.getHealthRecords = async (req, res) => {
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
            SELECT Id, HeartRate, BloodPressure, BloodSugar, Notes, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated 
            FROM HealthRecords 
            WHERE ElderlyId = ? 
            ORDER BY DatetimeCreated DESC
        `;
        const [records] = await db.execute(query, [elderlyId]);
        const recordsWithAlerts = records.map(rec => {
            let alerts = evaluateHealthAlerts(rec.BloodPressure, rec.HeartRate, rec.BloodSugar);
            return { ...rec, alerts };
        });
        return res.status(200).json({ records: recordsWithAlerts });
    } catch (err) {
        return res.status(500).json({ error: "Failed to fetch health records" });
    }
};

exports.submitCareReport = async (req, res) => {
    const caregiverId = req.user.userId;
    const { patientId, category, healthStatusNotes, dailyActivities, observations, photoUrl } = req.body;
    const id = crypto.randomUUID();
    try {
        const currentTimestamp = getCurrentMalaysiaMySQLDate();
        const query = `
            INSERT INTO CareReports 
            (Id, ElderlyId, Category, HealthStatusNotes, DailyActivities, Observations, PhotoUrl, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(query, [
            id, patientId, category || 'dailyLog', healthStatusNotes, dailyActivities, observations, photoUrl || null,
            caregiverId, currentTimestamp, caregiverId, currentTimestamp
        ]);
        return res.status(201).json({ message: "Care report submitted", reportId: id });
    } catch (err) {
        return res.status(500).json({ error: "Failed to submit care report" });
    }
};

exports.editCareReport = async (req, res) => {
  const userId = req.user.userId;
  const { reportId } = req.params;
  const { category, healthStatusNotes, dailyActivities, observations, photoUrl } = req.body;
  try {
      const timestamp = getCurrentMalaysiaMySQLDate();
      await db.execute(
          `UPDATE CareReports SET Category=?, HealthStatusNotes=?, DailyActivities=?, Observations=?, PhotoUrl=?, UpdatedBy=?, DatetimeUpdated=? WHERE Id=?`,
          [category||'dailyLog', healthStatusNotes, dailyActivities||'Daily Care Routine', observations, photoUrl||null, userId, timestamp, reportId]
      );
      return res.status(200).json({ message: "Report updated successfully" });
  } catch (err) {
      return res.status(500).json({ error: "Failed to update report" });
  }
};

exports.deleteCareReport = async (req, res) => {
  const { reportId } = req.params;
  try {
      await db.execute('DELETE FROM CareReports WHERE Id = ?', [reportId]);
      return res.status(200).json({ message: "Report deleted successfully" });
  } catch (err) {
      return res.status(500).json({ error: "Failed to delete report" });
  }
};

exports.getCareReports = async (req, res) => {
    const { elderlyId } = req.params;
    try {
        const [reports] = await db.execute(`
            SELECT cr.*, u.Name as CaregiverName, u.ProfilePhotoUrl as CaregiverProfilePhoto
            FROM CareReports cr
            JOIN Users u ON cr.CreatedBy = u.Id
            WHERE cr.ElderlyId = ?
            ORDER BY cr.DatetimeCreated DESC
        `, [elderlyId]);

        const [acks] = await db.execute(`
            SELECT cra.*, u.Name as FamilyName, u.ProfilePhotoUrl as FamilyProfilePhoto, fel.Relationship
            FROM CareReportAcknowledgements cra
            JOIN Users u ON cra.FamilyMemberId = u.Id
            LEFT JOIN FamilyElderlyLinks fel ON cra.FamilyMemberId = fel.FamilyMemberId AND fel.ElderlyId = ?
            WHERE cra.ReportId IN (SELECT Id FROM CareReports WHERE ElderlyId = ?)
            ORDER BY cra.DatetimeCreated ASC
        `, [elderlyId, elderlyId]);

        const formattedReports = reports.map(r => {
            return {
                ...r,
                Acknowledgements: acks.filter(a => a.ReportId === r.Id)
            };
        });
        return res.status(200).json({ reports: formattedReports });
    } catch (err) {
        return res.status(500).json({ error: "Failed to fetch care reports" });
    }
};

exports.getAssignedPatients = async (req, res) => {
    const caregiverId = req.user.userId;
    try {
        const query = `
            SELECT u.Id as elderlyId, u.Name as name, u.Email as email, ca.Id as connectionId
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

exports.getElderlyMoods = async (req, res) => {
    const { elderlyId } = req.params;
    try {
        const query = `
            SELECT Mood 
            FROM DailyMoods 
            WHERE ElderlyId = ? AND DATE(DatetimeCreated) = CURDATE() 
            ORDER BY DatetimeCreated DESC 
            LIMIT 1
        `;
        const [rows] = await db.execute(query, [elderlyId]);
        const todayMood = rows.length > 0 ? rows[0].Mood : null;
        return res.status(200).json({ todayMood });
    } catch (err) {
        return res.status(500).json({ error: "Failed to fetch elderly mood history" });
    }
};