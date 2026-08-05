const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * 1. GET /api/chat/messages/:elderlyId
 * Retrieves isolated message thread for a specific senior channel
 */
exports.getChannelMessages = async (req, res) => {
  const { elderlyId } = req.params;

  try {
    const query = `
      SELECT 
        c.Id,
        c.ElderlyId,
        c.SenderId,
        u.Name AS SenderName,
        u.Role AS SenderRole,
        c.MessageText,
        c.DatetimeCreated
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

/**
 * 2. POST /api/chat/send
 * Sends a message into an isolated senior channel with 5 mandatory audit columns
 */
exports.sendMessage = async (req, res) => {
  const authorGuid = req.user.userId; // Extracted from JWT token
  const { elderlyId, messageText, receiverId } = req.body;

  if (!elderlyId || !messageText || messageText.trim() === '') {
    return res.status(400).json({ error: "ElderlyId and message text are required." });
  }

  try {
    const messageGuid = uuidv4();

    const query = `
      INSERT INTO ChatMessages 
      (Id, ElderlyId, SenderId, ReceiverId, MessageText, CreatedBy, UpdatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(query, [
      messageGuid,
      elderlyId,
      authorGuid,
      receiverId || null,
      messageText.trim(),
      authorGuid, // CreatedBy
      authorGuid  // UpdatedBy
    ]);

    return res.status(201).json({
      message: "Message sent successfully",
      messageId: messageGuid
    });
  } catch (error) {
    console.error("Send Message Error:", error);
    return res.status(500).json({ error: "Failed to send message." });
  }
};