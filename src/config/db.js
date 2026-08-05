const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

// Create a connection pool for better performance and scalability
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: '+08:00', // Forces MySQL session to Malaysia Time (UTC+8)
    dateStrings: true,  // Prevents JS Date object offset conversions
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Export the pool to be used in your Models
module.exports = pool.promise();

