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
  try {          
    const timestamp = getCurrentMalaysiaMySQLDate();          
    
    // Satisfies the 5 mandatory DB audit columns exactly
    const query = `              
      INSERT INTO SosAlerts (Id, ElderlyId, Status, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)              
      VALUES (?, ?, 'Active', ?, ?, ?, ?)          
    `;          
    await db.execute(query, [id, elderlyId, elderlyId, timestamp, elderlyId, timestamp]);               
    
    // Broadcast the real-time event to connected Caregivers and Family Members
    if (req.io) {         
      req.io.emit('SOS_ALERT_EMITTED', { elderlyId, alertId: id, status: 'Active' });     
    }     
    return res.status(201).json({ message: "SOS Emergency Alert Sent!", alertId: id });      
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