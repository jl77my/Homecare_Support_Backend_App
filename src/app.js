const express = require('express'); 
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv'); 
const userRoutes = require('./routes/userRoutes'); 
const caregiverRoutes = require('./routes/caregiverRoutes'); 
const elderlyRoutes = require('./routes/elderlyRoutes'); 
const familyRoutes = require('./routes/familyRoutes'); 
const pairingRoutes = require('./routes/pairingRoutes'); 
const chatRoutes = require('./routes/chatRoutes'); 

dotenv.config(); 
const app = express(); 
const server = http.createServer(app);

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || '')     
    .split(',')     
    .map((origin) => origin.trim())     
    .filter(Boolean); 

const corsOptions = {     
    methods: 'GET,POST,PUT,DELETE,OPTIONS',     
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With, Accept, Origin',     
    credentials: process.env.CORS_CREDENTIALS !== 'false',
};

// Initialize Socket.io with CORS
const io = new Server(server, { cors: corsOptions });

app.use((req, res, next) => {     
    const requestOrigin = req.headers.origin;     
    if (requestOrigin && (allowedOrigins.length === 0 || allowedOrigins.includes(requestOrigin))) {         
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);         
        res.setHeader('Vary', 'Origin');     
    }     
    res.setHeader('Access-Control-Allow-Methods', corsOptions.methods);     
    res.setHeader('Access-Control-Allow-Headers', corsOptions.allowedHeaders);     
    if (corsOptions.credentials) {         
        res.setHeader('Access-Control-Allow-Credentials', 'true');     
    }     
    if (req.method === 'OPTIONS') {         
        return res.sendStatus(204);     
    }     
    
    // Attach socket.io to the request
    req.io = io;
    next(); 
});

app.use(express.json()); 

// Link the routes 
app.use('/api/users', userRoutes); 
app.use('/api/caregiver', caregiverRoutes); 
app.use('/api/elderly', elderlyRoutes); 
app.use('/api/family', familyRoutes); 
app.use('/api/pairing', pairingRoutes); 
app.use('/api/chat', chatRoutes); 

app.options('/api/users/register', (req, res) => {     
    res.sendStatus(204); 
});

const PORT = process.env.PORT || 3000; 

// Replace app.listen with server.listen
server.listen(PORT, () => {     
    console.log(`Server running on port ${PORT} with WebSockets enabled`); 
});