const db = require('../config/db'); 
const crypto = require('crypto'); 
const { getCurrentMalaysiaMySQLDate } = require('../helper/helper'); 

exports.confirmMedication = async (req, res) => {   
  const userId = req.user.userId;   
  const { medicationId, status, elderlyId } = req.body;   
  const targetElderlyId = elderlyId || userId;   
  try {     
    const timestamp = getCurrentMalaysiaMySQLDate();          
    
    const [existingLogs] = await db.execute(       
      `SELECT Id FROM MedicationLogs WHERE MedicationId = ? AND DATE(DatetimeCreated) = CURDATE()`,       
      [medicationId]     
    );     
    if (existingLogs.length > 0) {       
      await db.execute('DELETE FROM MedicationLogs WHERE Id = ?', [existingLogs[0].Id]);       
      return res.status(200).json({ message: "Medication reset to pending successfully" });     
    } else {       
      const id = crypto.randomUUID();       
      const query = `         
        INSERT INTO MedicationLogs (Id, MedicationId, ElderlyId, Status, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)         
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)       
      `;       
      await db.execute(query, [id, medicationId, targetElderlyId, status || 'Taken', userId, timestamp, userId, timestamp]);       
      return res.status(201).json({ message: "Medication confirmation logged successfully", logId: id });     
    }   
  } catch (err) {     
    console.error("Confirm Medication Error:", err);     
    return res.status(500).json({ error: "Failed to confirm medication" }); 
  }
}; 

exports.deleteMedication = async (req, res) => {   
  const { id } = req.params;   
  try {     
    await db.execute('DELETE FROM Medications WHERE Id = ?', [id]);     
    return res.status(200).json({ message: "Medication deleted successfully" });   
  } catch (err) {     
    console.error("Delete Medication Error:", err);     
    return res.status(500).json({ error: "Failed to delete medication" }); 
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
  const { latitude, longitude, accuracy } = req.body;

  const parsedLatitude = latitude == null ? null : Number(latitude);
  const parsedLongitude = longitude == null ? null : Number(longitude);
  const parsedAccuracy = accuracy == null ? null : Number(accuracy);

  const hasValidLocation =
    Number.isFinite(parsedLatitude) && parsedLatitude >= -90 && parsedLatitude <= 90 &&
    Number.isFinite(parsedLongitude) && parsedLongitude >= -180 && parsedLongitude <= 180;

  if ((latitude != null || longitude != null) && !hasValidLocation) {
    return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
  }

  try {          
    const timestamp = getCurrentMalaysiaMySQLDate();          
    
    // Satisfies the 5 mandatory DB audit columns exactly
    const query = `              
      INSERT INTO SosAlerts
        (Id, ElderlyId, Status, Latitude, Longitude, LocationAccuracy,
         CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?)
    `;          
    await db.execute(query, [
      id,
      elderlyId,
      hasValidLocation ? parsedLatitude : null,
      hasValidLocation ? parsedLongitude : null,
      Number.isFinite(parsedAccuracy) && parsedAccuracy >= 0 ? parsedAccuracy : null,
      elderlyId,
      timestamp,
      elderlyId,
      timestamp,
    ]);

    const [[elderly]] = await db.execute(
      'SELECT Name FROM Users WHERE Id = ? LIMIT 1',
      [elderlyId]
    );

    const [recipients] = await db.execute(
      `
        SELECT DISTINCT RecipientId
        FROM (
          SELECT CaregiverId AS RecipientId
          FROM CaregiverAssignments
          WHERE ElderlyId = ? AND (Status IS NULL OR Status = '' OR Status = 'ACTIVE')
          UNION
          SELECT FamilyMemberId AS RecipientId
          FROM FamilyElderlyLinks
          WHERE ElderlyId = ? AND (Status IS NULL OR Status = '' OR Status = 'ACTIVE')
        ) linkedRecipients
      `,
      [elderlyId, elderlyId]
    );

    const alertPayload = {
      elderlyId,
      elderlyName: elderly?.Name || 'Elderly user',
      alertId: id,
      status: 'Active',
      latitude: hasValidLocation ? parsedLatitude : null,
      longitude: hasValidLocation ? parsedLongitude : null,
      accuracy: Number.isFinite(parsedAccuracy) && parsedAccuracy >= 0 ? parsedAccuracy : null,
      triggeredAt: timestamp,
    };
    
    // Send sensitive location data only to actively linked caregivers/family.
    if (req.io) {        
      recipients.forEach(({ RecipientId }) => {
        req.io.to(`user:${RecipientId}`).emit('SOS_ALERT_EMITTED', alertPayload);
      });
    }     
    return res.status(201).json({
      message: "SOS Emergency Alert Sent!",
      alertId: id,
      notifiedRecipients: recipients.length,
      locationShared: hasValidLocation,
    });      
  } catch (err) {          
    console.error("Trigger SOS Error:", err);          
    return res.status(500).json({ error: "Failed to trigger SOS alert" }); 
  }
}; 

exports.getMedications = async (req, res) => {   
  const userRole = req.user.role.toLowerCase();   
  let elderlyId = req.user.userId;   
  if (userRole !== 'elderly') {     
    if (req.query.elderlyId) {       
      elderlyId = req.query.elderlyId;     
    } else {       
      return res.status(400).json({ error: "ElderlyId context is required." });     
    }   
  }
  try {     
    const query = `       
      SELECT            
      m.Id, m.ElderlyId AS ElderlyId, m.MedicationName, m.Dosage,            
      m.ScheduledDate, m.ScheduledTime, m.Category, m.Frequency, m.Notes,           
      m.CreatedBy, u.Name AS CreatorName, m.DatetimeCreated, m.UpdatedBy, m.DatetimeUpdated,           
      (SELECT ml.Status FROM MedicationLogs ml WHERE ml.MedicationId = m.Id AND DATE(ml.DatetimeCreated) = CURDATE() ORDER BY ml.DatetimeCreated DESC LIMIT 1) AS Status,           
      (SELECT ml.DatetimeCreated FROM MedicationLogs ml WHERE ml.MedicationId = m.Id AND DATE(ml.DatetimeCreated) = CURDATE() ORDER BY ml.DatetimeCreated DESC LIMIT 1) AS CompletedAt       
      FROM Medications m       
      LEFT JOIN Users u ON m.CreatedBy = u.Id       
      WHERE m.ElderlyId = ?       
      ORDER BY m.ScheduledDate ASC, m.ScheduledTime ASC     
    `;     
    const [medications] = await db.execute(query, [elderlyId]);     
    return res.status(200).json({ medications });   
  } catch (err) {     
    console.error("Get Medications Error:", err);     
    return res.status(500).json({ error: "Failed to fetch medications" }); 
  }
};
