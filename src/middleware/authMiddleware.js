const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) {
        return res.status(403).json({ error: "No token provided" });
    }

   try {
        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured');
            return res.status(500).json({ error: "Authentication is not configured" });
        }
        // 3. Verify cryptographic token signature using secret
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 4. Attach decoded payload to req.user
        // Expected payload structure: { userId: 'xxx-guid-xxx', role: 'caregiver', email: '...' }
        req.user = {
            userId: decoded.userId || decoded.id, // Handles both naming conventions
            role: decoded.role,
            email: decoded.email
        };

        next(); // Proceed to controller logic
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
    }
};

module.exports = verifyToken;
