const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const verifyToken = require('../middleware/authMiddleware');
const { formatMySQLDate, getCurrentMalaysiaMySQLDate } = require('../helper/helper');

exports.createTask = async (req, res) => {
    verifyToken(req, res, async () => {
        try {
            const { Title, Description, DueDate, AssignedTo } = req.body;
            const formattedDueDate = formatMySQLDate(DueDate);

            const Id = uuidv4();
            const now = getCurrentMalaysiaMySQLDate();
            const CreatorId = req.user?.id || req.user?.userId; // Extracted from the JWT

            const sql = `INSERT INTO Tasks (Id, Title, Description, DueDate, AssignedTo, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            const values = [Id, Title, Description, formattedDueDate, AssignedTo, CreatorId, now, CreatorId, now];

            await db.execute(sql, values);

            res.status(201).json({ message: "Task created successfully", TaskId: Id });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Failed to create task" });
        }
    });
};