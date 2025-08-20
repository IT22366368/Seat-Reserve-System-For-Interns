// middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ message: 'Access token required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database to ensure they still exist
        const userResult = await db.query(
            'SELECT id, name, email, role FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(403).json({ message: 'Invalid token - user not found' });
        }

        req.user = userResult.rows[0];
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(403).json({ message: 'Token expired' });
        }
        return res.status(403).json({ message: 'Invalid token' });
    }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

// Check if user is intern
const requireIntern = (req, res, next) => {
    if (req.user.role !== 'intern') {
        return res.status(403).json({ message: 'Intern access required' });
    }
    next();
};

// Validate company email domain
const validateEmailDomain = (req, res, next) => {
    const { email } = req.body;
    const companyDomain = process.env.COMPANY_EMAIL_DOMAIN;
    
    if (!email.endsWith(`@${companyDomain}`)) {
        return res.status(400).json({ 
            message: `Only ${companyDomain} email addresses are allowed` 
        });
    }
    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireIntern,
    validateEmailDomain
};