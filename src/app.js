// app.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const db = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const caregiverRoutes = require('./routes/caregiverRoutes');
const elderlyRoutes = require('./routes/elderlyRoutes');
const familyRoutes = require('./routes/familyRoutes');
const pairingRoutes = require('./routes/pairingRoutes');
const chatRoutes = require('./routes/chatRoutes');
const agentRoutes = require('./routes/agentRoutes');

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOptions = {
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: process.env.CORS_CREDENTIALS !== 'false',
};

const io = new Server(server, { cors: corsOptions });

// A client joins only its own private room after its JWT has been verified.
// Existing sockets that do not register still receive non-sensitive global
// events such as medication alarms.
io.on('connection', (socket) => {
    socket.on('REGISTER_USER', (payload = {}) => {
        try {
            const token = typeof payload === 'string' ? payload : payload.token;
            if (!token) return;

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.userId || decoded.id;
            if (!userId) return;

            socket.join(`user:${userId}`);
        } catch (error) {
            console.warn('Rejected SOS socket registration:', error.message);
        }
    });
});

app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    if (requestOrigin && (allowedOrigins.length === 0 || allowedOrigins.includes(requestOrigin))) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', corsOptions.methods.join(','));
    res.setHeader('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(','));
    if (corsOptions.credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    req.io = io;
    next();
});

// FIX 1: INCREASE JSON LIMIT TO ACCEPT BASE64 PROFILE PHOTOS
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api/users', userRoutes);
app.use('/api/caregiver', caregiverRoutes);
app.use('/api/elderly', elderlyRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/pairing', pairingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/agent', agentRoutes);

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.options('/api/users/register', (req, res) => {
    res.sendStatus(204);
});

cron.schedule('* * * * *', async () => {
    try {
        const malaysiaTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
        const currentTime = malaysiaTime.toISOString().slice(11, 16) + ':00'; 
        const currentDate = malaysiaTime.toISOString().slice(0, 10); 
        
        const query = `
            SELECT m.*, u.Name as ElderlyName 
            FROM Medications m 
            JOIN Users u ON m.ElderlyId = u.Id 
            WHERE m.ScheduledTime = ? 
            AND (m.Frequency = 'daily' OR m.ScheduledDate = ?)
        `;
        
        const [medications] = await db.execute(query, [currentTime, currentDate]);
        
        medications.forEach(med => {
            io.emit('MEDICATION_ALARM', {
                medicationId: med.Id,
                elderlyId: med.ElderlyId,
                elderlyName: med.ElderlyName,
                medicationName: med.MedicationName,
                dosage: med.Dosage,
                time: med.ScheduledTime
            });
        });
    } catch (err) {
        console.error("Medication Cron Job Error:", err);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with WebSockets enabled`);
});
