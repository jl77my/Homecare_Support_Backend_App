const db = require('../config/db');
const crypto = require('crypto');
const { getCurrentMalaysiaMySQLDate } = require('../helper/helper');

const getAccessibleElderlyIds = async (userId, role) => {
  const normalizedRole = role.toLowerCase();

  if (normalizedRole === 'elderly') {
    return [userId];
  }

  if (normalizedRole === 'caregiver') {
    const [rows] = await db.execute(`
      SELECT ElderlyId
      FROM CaregiverAssignments
      WHERE CaregiverId = ?
        AND (Status IS NULL OR Status = '' OR Status = 'ACTIVE')
    `, [userId]);
    return rows.map((row) => row.ElderlyId);
  }

  if (normalizedRole === 'family') {
    const [rows] = await db.execute(`
      SELECT ElderlyId
      FROM FamilyElderlyLinks
      WHERE FamilyMemberId = ?
        AND (Status IS NULL OR Status = '' OR Status = 'ACTIVE')
    `, [userId]);
    return rows.map((row) => row.ElderlyId);
  }

  return [];
};

const canAccessChannel = async (userId, role, elderlyId) => {
  const accessibleIds = await getAccessibleElderlyIds(userId, role);
  return accessibleIds.includes(elderlyId);
};

exports.getChannelMessages = async (req, res) => {
  const { elderlyId } = req.params;
  const userId = req.user.userId;
  try {
    if (!await canAccessChannel(userId, req.user.role, elderlyId)) {
      return res.status(403).json({ error: "You do not have access to this chat channel." });
    }

    const query = `
      SELECT 
        c.Id, c.ElderlyId, c.SenderId, u.Name AS SenderName, 
        u.Role AS SenderRole, c.MessageText, c.DatetimeCreated
      FROM ChatMessages c
      JOIN Users u ON c.SenderId = u.Id
      WHERE c.ElderlyId = ?
      ORDER BY c.DatetimeCreated ASC, c.Id ASC
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
    if (!await canAccessChannel(authorGuid, req.user.role, elderlyId)) {
      return res.status(403).json({ error: "You do not have access to this chat channel." });
    }

    const messageGuid = crypto.randomUUID();
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

exports.getUnreadCounts = async (req, res) => {
  const userId = req.user.userId;

  try {
    const elderlyIds = await getAccessibleElderlyIds(userId, req.user.role);
    const unreadCounts = Object.fromEntries(elderlyIds.map((elderlyId) => [elderlyId, 0]));

    if (elderlyIds.length === 0) {
      return res.status(200).json({ unreadCounts });
    }

    const placeholders = elderlyIds.map(() => '?').join(',');
    const [rows] = await db.execute(`
      SELECT c.ElderlyId, COUNT(*) AS UnreadCount
      FROM ChatMessages c
      LEFT JOIN ChatReadReceipts receipt
        ON receipt.UserId = ? AND receipt.ElderlyId = c.ElderlyId
      LEFT JOIN ChatMessages lastRead
        ON lastRead.Id = receipt.LastReadMessageId
      WHERE c.ElderlyId IN (${placeholders})
        AND c.SenderId <> ?
        AND (
          lastRead.Id IS NULL
          OR c.DatetimeCreated > lastRead.DatetimeCreated
          OR (c.DatetimeCreated = lastRead.DatetimeCreated AND c.Id > lastRead.Id)
        )
      GROUP BY c.ElderlyId
    `, [userId, ...elderlyIds, userId]);

    for (const row of rows) {
      unreadCounts[row.ElderlyId] = Number(row.UnreadCount);
    }

    return res.status(200).json({ unreadCounts });
  } catch (error) {
    console.error("Fetch Unread Counts Error:", error);
    return res.status(500).json({ error: "Failed to load unread message counts." });
  }
};

exports.markChannelAsRead = async (req, res) => {
  const { elderlyId } = req.params;
  const { lastReadMessageId } = req.body;
  const userId = req.user.userId;

  if (!lastReadMessageId) {
    return res.status(400).json({ error: "LastReadMessageId is required." });
  }

  try {
    if (!await canAccessChannel(userId, req.user.role, elderlyId)) {
      return res.status(403).json({ error: "You do not have access to this chat channel." });
    }

    const [messageRows] = await db.execute(`
      SELECT Id
      FROM ChatMessages
      WHERE Id = ? AND ElderlyId = ?
    `, [lastReadMessageId, elderlyId]);

    if (messageRows.length === 0) {
      return res.status(400).json({ error: "The selected message does not belong to this channel." });
    }

    const receiptId = crypto.randomUUID();
    const timestamp = getCurrentMalaysiaMySQLDate();

    await db.execute(`
      INSERT INTO ChatReadReceipts
        (Id, UserId, ElderlyId, LastReadMessageId, LastReadAt,
         CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        LastReadMessageId = VALUES(LastReadMessageId),
        LastReadAt = VALUES(LastReadAt),
        UpdatedBy = VALUES(UpdatedBy),
        DatetimeUpdated = VALUES(DatetimeUpdated)
    `, [
      receiptId, userId, elderlyId, lastReadMessageId, timestamp,
      userId, timestamp, userId, timestamp
    ]);

    const [countRows] = await db.execute(`
      SELECT COUNT(*) AS UnreadCount
      FROM ChatMessages c
      JOIN ChatMessages lastRead ON lastRead.Id = ?
      WHERE c.ElderlyId = ?
        AND c.SenderId <> ?
        AND (
          c.DatetimeCreated > lastRead.DatetimeCreated
          OR (c.DatetimeCreated = lastRead.DatetimeCreated AND c.Id > lastRead.Id)
        )
    `, [lastReadMessageId, elderlyId, userId]);

    const unreadCount = Number(countRows[0].UnreadCount);

    return res.status(200).json({
      message: "Channel marked as read.",
      lastReadMessageId,
      unreadCount
    });
  } catch (error) {
    console.error("Mark Channel Read Error:", error);
    return res.status(500).json({ error: "Failed to mark channel as read." });
  }
};
