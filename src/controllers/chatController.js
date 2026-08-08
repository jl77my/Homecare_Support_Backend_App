const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { getCurrentMalaysiaMySQLDate } = require('../helper/helper');

exports.getChannelMessages = async (req, res) => {
  const { elderlyId } = req.params;
  try {
    const query = `
      SELECT 
        c.Id, c.ElderlyId, c.SenderId, u.Name AS SenderName, 
        u.Role AS SenderRole, c.MessageText, c.DatetimeCreated
      FROM ChatMessages c
      JOIN Users u ON c.SenderId = u.Id
      WHERE c.ElderlyId = ?
      ORDER BY c.DatetimeCreated ASC
    `;
    const [rows] = await db.execute(query, [elderlyId]);
    return res.status(200).json({
      messages: rows.map(r => ({
        id: r.Id,
        elderlyId: r.ElderlyId,
        senderId: r.SenderId,
        senderName: r.SenderName,
        senderRole: r.SenderRole,
        text: r.MessageText,
        timestamp: r.DatetimeCreated
      }))
    });
  } catch (error) {
    console.error("Fetch Messages Error:", error);
    return res.status(500).json({ error: "Failed to load channel messages." });
  }
};

exports.sendMessage = async (req, res) => {
  const authorGuid = req.user.userId; 
  const { elderlyId, messageText, receiverId } = req.body;

  if (!elderlyId || !messageText || messageText.trim() === '') {
    return res.status(400).json({ error: "ElderlyId and message text are required." });
  }

  try {
    const messageGuid = uuidv4();
    const timestamp = getCurrentMalaysiaMySQLDate();

    const query = `
      INSERT INTO ChatMessages 
       (Id, ElderlyId, SenderId, ReceiverId, MessageText, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.execute(query, [
      messageGuid, elderlyId, authorGuid, receiverId || null, messageText.trim(),
      authorGuid, timestamp, authorGuid, timestamp
    ]);

    return res.status(201).json({ message: "Message sent successfully", messageId: messageGuid });
  } catch (error) {
    console.error("Send Message Error:", error);
    return res.status(500).json({ error: "Failed to send message." });
  }
};