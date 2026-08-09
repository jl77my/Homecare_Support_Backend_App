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
    return res.status(500).json({ error: "Failed to create task" });  
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
  const { elderlyId } = req.params;         
  try {               
    const query = `                     
      SELECT                        
      Id, Title, Description, Status, DueDate, AssignedTo,                        
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
    const timestamp = getCurrentMalaysiaMySQLDate();                    
    const query = `                     
      UPDATE Tasks                      
      SET Status = ?, UpdatedBy = ?, DatetimeUpdated = ?                      
      WHERE Id = ?               
    `;                    
    await db.execute(query, [status, userId, timestamp, taskId]);               
    return res.status(200).json({ message: "Task status updated successfully" });         
  } catch (err) {               
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
          if (sys >= 140 || dia >= 90) alerts.push("High Blood Pressure Alert!");                           
        }                     
      }                     
      if (rec.HeartRate) {                           
        const hr = parseInt(rec.HeartRate, 10);                           
        if (hr > 100 || hr < 60) alerts.push("Abnormal Heart Rate Alert!");                     
      }                     
      if (rec.BloodSugar) {                           
        const sugar = parseFloat(rec.BloodSugar);                           
        if (sugar > 11.0) alerts.push("High Blood Glucose Alert!");                     
      }                     
      return { ...rec, alerts };               
    });               
    return res.status(200).json({ records: recordsWithAlerts });         
  } catch (err) {               
    return res.status(500).json({ error: "Failed to fetch health records" });  
  } 
};

exports.getCareReports = async (req, res) => {         
  const { elderlyId } = req.params;         
  try {               
    const [reports] = await db.execute(`
      SELECT cr.*, u.Name as CaregiverName 
      FROM CareReports cr 
      JOIN Users u ON cr.CreatedBy = u.Id 
      WHERE cr.ElderlyId = ? 
      ORDER BY cr.DatetimeCreated DESC
    `, [elderlyId]);
    const [acks] = await db.execute(`
      SELECT cra.*, u.Name as FamilyName, fel.Relationship 
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

exports.acknowledgeReport = async (req, res) => {
  const familyMemberId = req.user.userId;
  const { reportId } = req.params;
  let { comment } = req.body;
  const id = crypto.randomUUID();
  try {
    const timestamp = getCurrentMalaysiaMySQLDate();
    if (!comment || comment.trim() === '') {
        const [userRows] = await db.execute('SELECT Name FROM Users WHERE Id = ?', [familyMemberId]);
        const familyName = userRows.length > 0 ? userRows[0].Name : 'Family Member';
        comment = `Report acknowledged by ${familyName}.`;
    }
    const query = `
      INSERT INTO CareReportAcknowledgements 
      (Id, ReportId, FamilyMemberId, Comment, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.execute(query, [id, reportId, familyMemberId, comment, familyMemberId, timestamp, familyMemberId, timestamp]);
    return res.status(201).json({ message: "Report acknowledged successfully." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to acknowledge report" });
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
    const timestamp = getCurrentMalaysiaMySQLDate();               
    const query = `                     
      INSERT INTO FamilyElderlyLinks                      
      (Id, FamilyMemberId, ElderlyId, Relationship, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)                     
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)               
    `;               
    await db.execute(query, [                     
      linkId, familyMemberId, elderlyId, relationship || 'Family Member',                     
      familyMemberId, timestamp, familyMemberId, timestamp          
    ]);               
    await db.execute(                     
      'UPDATE PairingCodes SET IsUsed = TRUE, UpdatedBy = ?, DatetimeUpdated = ? WHERE Id = ?',                     
      [familyMemberId, timestamp, pairingRecord.Id]               
    );               
    return res.status(201).json({                     
      message: "Successfully linked to elderly patient!",                     
      linkId: linkId               
    });         
  } catch (error) {               
    return res.status(500).json({ error: "Failed to process family pairing." });  
  } 
};

exports.getLinkedElderly = async (req, res) => {         
  const familyMemberId = req.user.userId;         
  try {               
    const query = `                     
      SELECT                        
      f.ElderlyId AS elderlyId, u.Name AS name, u.Email AS email,                        
      f.Relationship AS relationship, f.CreatedBy, f.DatetimeCreated, f.UpdatedBy, f.DatetimeUpdated                     
      FROM FamilyElderlyLinks f                     
      JOIN Users u ON f.ElderlyId = u.Id                     
      WHERE f.FamilyMemberId = ?                     
      ORDER BY f.DatetimeCreated DESC               
    `;               
    const [seniors] = await db.execute(query, [familyMemberId]);               
    return res.status(200).json({ seniors });         
  } catch (err) {               
    return res.status(500).json({ error: "Failed to fetch linked elderly list" });  
  } 
};