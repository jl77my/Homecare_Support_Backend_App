const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.registerUser = async (req, res) => {
    const { Name, Email, Password, Role } = req.body;

    // 1. Validation: Ensure all fields are provided
    if (!Name || !Email || !Password || !Role) {
        return res.status(400).json({ message: "All fields are required." });
    }

    const normalizedEmail = Email.trim().toLowerCase();

    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(Password, saltRounds);

        // 2. Generate a Guid for the new user Primary Key
        const newId = uuidv4();
        
        // 3. SQL Query matching all 5 standardized audit columns
        const query = `
            INSERT INTO Users (Id, Name, Email, Password, Role, CreatedBy, UpdatedBy) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        // For registration, CreatedBy and UpdatedBy are set to the new user's ID
        await db.execute(query, [newId, Name, normalizedEmail, hashedPassword, Role, newId, newId]);

        res.status(201).json({
            message: "User registered successfully!",
            userId: newId
        });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
            return res.status(409).json({ message: "Email address is already registered." });
        }
        res.status(500).json({ message: "Server error during registration.", error: error.message });
    }
};

exports.loginUser = async (req, res) => {
    try {
        const { Email, Password } = req.body;
        const jwtSecret = process.env.JWT_SECRET;

        if (!Email || !Password) {
            return res.status(400).json({ error: 'Email and Password are required' });
        }

        if (!jwtSecret) {
            return res.status(500).json({ error: 'JWT secret is not configured' });
        }

        const normalizedEmail = Email.trim().toLowerCase();

        // 1. Find the user by Email
        const [rows] = await db.execute(
            'SELECT * FROM Users WHERE LOWER(Email) = ?', 
            [normalizedEmail]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid Email or Password" });
        }

        const user = rows[0];

        // 2. Compare the provided password with the Hashed password in DB
        const isMatch = await bcrypt.compare(Password, user.Password);

        if (!isMatch) {
            return res.status(401).json({ error: "Invalid Email or Password" });
        }

        const tokenPayload = {
            id: user.Id,
            email: user.Email,
            role: user.Role
        };

        const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '1h' });

        res.status(200).json({ 
            message: "Login successful", 
            token,
            user: {
                id: user.Id,
                name: user.Name,
                email: user.Email,
                role: user.Role
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Login process failed" });
    }
};

exports.healthCheck = (req, res) => {
    res.status(200).json({ 
        message: "Backend is running",
        timestamp: new Date().toISOString()
    });
};