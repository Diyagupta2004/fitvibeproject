const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { 
    getUserByEmail, 
    createUser, 
    updateUser, 
    executeQuery 
} = require('../config/database');
const { 
    generateToken, 
    generateRefreshToken, 
    verifyRefreshToken,
    authenticateToken 
} = require('../middleware/auth');
const {
    validateUserRegistration,
    validateUserLogin,
    validatePasswordResetRequest,
    validatePasswordReset
} = require('../middleware/validation');

const router = express.Router();

// Email transporter setup
const createEmailTransporter = () => {
    return nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', validateUserRegistration, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Hash password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Generate email verification token
        const emailVerificationToken = crypto.randomBytes(32).toString('hex');

        // Create user
        const userId = await createUser({
            name,
            email,
            password_hash,
            email_verification_token: emailVerificationToken
        });

        // Create user profile
        const profileQuery = `
            INSERT INTO user_profiles (user_id) VALUES (?)
        `;
        await executeQuery(profileQuery, [userId]);

        // Send verification email (optional - can be skipped for development)
        if (process.env.EMAIL_USER && process.env.NODE_ENV === 'production') {
            try {
                const transporter = createEmailTransporter();
                const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${emailVerificationToken}`;
                
                await transporter.sendMail({
                    from: process.env.EMAIL_FROM,
                    to: email,
                    subject: 'Welcome to FitVibe - Verify Your Email',
                    html: `
                        <h2>Welcome to FitVibe!</h2>
                        <p>Thank you for joining our fitness community. Please verify your email address by clicking the link below:</p>
                        <a href="${verificationUrl}" style="background-color: #cc66ff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
                        <p>If you didn't create this account, please ignore this email.</p>
                    `
                });
            } catch (emailError) {
                console.error('Email sending failed:', emailError);
                // Continue with registration even if email fails
            }
        }

        res.status(201).json({
            success: true,
            message: 'User registered successfully. Please check your email for verification.',
            data: {
                id: userId,
                name,
                email,
                needsVerification: !!process.env.EMAIL_USER
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', validateUserLogin, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Get user by email
        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if account is active
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated. Please contact support.'
            });
        }

        // Generate tokens
        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);

        // Update last login (optional)
        const updateLastLoginQuery = `
            UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `;
        await executeQuery(updateLastLoginQuery, [user.id]);

        // Remove sensitive data
        const { password_hash, email_verification_token, password_reset_token, ...userData } = user;

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                ...userData,
                token,
                refreshToken
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        // Verify refresh token
        const decoded = verifyRefreshToken(refreshToken);
        
        // Get user
        const user = await getUserByEmail(decoded.email);
        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new access token
        const newToken = generateToken(user);

        res.json({
            success: true,
            data: {
                token: newToken
            }
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', validatePasswordResetRequest, async (req, res) => {
    try {
        const { email } = req.body;

        const user = await getUserByEmail(email);
        if (!user) {
            // Don't reveal if email exists or not
            return res.json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save reset token
        await updateUser(user.id, {
            password_reset_token: resetToken,
            password_reset_expires: resetExpires
        });

        // Send reset email
        if (process.env.EMAIL_USER) {
            try {
                const transporter = createEmailTransporter();
                const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
                
                await transporter.sendMail({
                    from: process.env.EMAIL_FROM,
                    to: email,
                    subject: 'FitVibe - Password Reset Request',
                    html: `
                        <h2>Password Reset Request</h2>
                        <p>You requested a password reset for your FitVibe account. Click the link below to reset your password:</p>
                        <a href="${resetUrl}" style="background-color: #cc66ff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
                        <p>This link will expire in 10 minutes.</p>
                        <p>If you didn't request this reset, please ignore this email.</p>
                    `
                });
            } catch (emailError) {
                console.error('Password reset email failed:', emailError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send reset email. Please try again.'
                });
            }
        }

        res.json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Password reset request failed. Please try again.'
        });
    }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', validatePasswordReset, async (req, res) => {
    try {
        const { token, password } = req.body;

        // Find user with valid reset token
        const query = `
            SELECT * FROM users 
            WHERE password_reset_token = ? 
            AND password_reset_expires > NOW() 
            AND is_active = TRUE
        `;
        const users = await executeQuery(query, [token]);
        
        if (users.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        const user = users[0];

        // Hash new password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Update password and clear reset token
        await updateUser(user.id, {
            password_hash,
            password_reset_token: null,
            password_reset_expires: null
        });

        res.json({
            success: true,
            message: 'Password reset successful. You can now login with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Password reset failed. Please try again.'
        });
    }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email address
// @access  Public
router.post('/verify-email', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Verification token is required'
            });
        }

        // Find user with verification token
        const query = `
            SELECT * FROM users 
            WHERE email_verification_token = ? 
            AND is_active = TRUE
        `;
        const users = await executeQuery(query, [token]);
        
        if (users.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification token'
            });
        }

        const user = users[0];

        // Update user as verified
        await updateUser(user.id, {
            email_verified: true,
            email_verification_token: null
        });

        res.json({
            success: true,
            message: 'Email verified successfully'
        });

    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Email verification failed. Please try again.'
        });
    }
});

// @route   POST /api/auth/change-password
// @desc    Change password (authenticated)
// @access  Private
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, req.user.password_hash);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const password_hash = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await updateUser(req.user.id, { password_hash });

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Password change failed. Please try again.'
        });
    }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
    try {
        // Remove sensitive data
        const { password_hash, email_verification_token, password_reset_token, ...userData } = req.user;
        
        res.json({
            success: true,
            data: userData
        });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user data'
        });
    }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticateToken, (req, res) => {
    // In a stateless JWT system, logout is handled client-side by removing the token
    // For enhanced security, you could maintain a blacklist of tokens in Redis
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

module.exports = router;
