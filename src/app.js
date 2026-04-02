const express = require('express');
const dotenv = require('dotenv');
const userRoutes = require('./routes/userRoutes');
const taskRoutes = require('./routes/taskRoutes');
const recordRoutes = require('./routes/recordRoutes');

dotenv.config();
const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOptions = {
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
    credentials: process.env.CORS_CREDENTIALS !== 'false',
};

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

    next();
});

app.use(express.json());

// Link the routes
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/records', recordRoutes);

app.options('/api/users/register', (req, res) => {
    res.sendStatus(204);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});