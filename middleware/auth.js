const jwt = require('jsonwebtoken');
const { getUserById } = require('../config/database');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        const jwtSecret = process.env.JWT_SECRET || 'fitvibe_development_secret_key_2024_change_in_production';
        const decoded = jwt.verify(token, jwtSecret);
        
        // Get user from database to ensure they still exist and are active
        const user = await getUserById(decoded.id);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token - user not found'
            });
        }

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Add user to request object
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
};

// Check if user has active subscription
const requireSubscription = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    const now = new Date();
    const subscriptionEndDate = new Date(req.user.subscription_end_date);

    if (req.user.subscription_plan && subscriptionEndDate > now) {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Active subscription required',
            code: 'SUBSCRIPTION_REQUIRED'
        });
    }
};

// Check if user has premium subscription
const requirePremium = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    const now = new Date();
    const subscriptionEndDate = new Date(req.user.subscription_end_date);
    const premiumPlans = ['premium', 'elite'];

    if (premiumPlans.includes(req.user.subscription_plan) && subscriptionEndDate > now) {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Premium subscription required',
            code: 'PREMIUM_REQUIRED'
        });
    }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const jwtSecret = process.env.JWT_SECRET || 'fitvibe_development_secret_key_2024_change_in_production';
        const decoded = jwt.verify(token, jwtSecret);
            const user = await getUserById(decoded.id);
            
            if (user && user.is_active) {
                req.user = user;
            }
        }
        
        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};

// Generate JWT token
const generateToken = (user) => {
    const jwtSecret = process.env.JWT_SECRET || 'fitvibe_development_secret_key_2024_change_in_production';
    
    if (!jwtSecret) {
        throw new Error('JWT_SECRET is not configured. Please set JWT_SECRET in your .env file.');
    }
    
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            role: user.role 
        },
        jwtSecret,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

// Generate refresh token
const generateRefreshToken = (user) => {
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'fitvibe_development_refresh_secret_key_2024';
    
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email,
            type: 'refresh'
        },
        jwtRefreshSecret,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
    );
};

// Verify refresh token
const verifyRefreshToken = (token) => {
    try {
        const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'fitvibe_development_refresh_secret_key_2024';
        const decoded = jwt.verify(token, jwtRefreshSecret);
        if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
        }
        return decoded;
    } catch (error) {
        throw error;
    }
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireSubscription,
    requirePremium,
    optionalAuth,
    generateToken,
    generateRefreshToken,
    verifyRefreshToken
};
