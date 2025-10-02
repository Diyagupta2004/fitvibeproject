const express = require('express');
const { 
    updateUserSubscription,
    executeQuery 
} = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validatePayment } = require('../middleware/validation');

const router = express.Router();

// Simple subscription plans
const SUBSCRIPTION_PLANS = {
    basic: {
        name: 'Basic Plan',
        price: 999,
        duration_days: 30,
        features: ['Basic workouts', 'BMI tracking', 'Email support']
    },
    premium: {
        name: 'Premium Plan', 
        price: 1999,
        duration_days: 30,
        features: ['All Basic features', 'Premium workouts', 'Nutrition plans', 'Priority support']
    },
    elite: {
        name: 'Elite Plan',
        price: 2999, 
        duration_days: 30,
        features: ['All Premium features', 'Personal trainer', '24/7 support', 'Custom meal plans']
    }
};

// @route   GET /api/payments/subscription-status
// @desc    Get user's current subscription status
// @access  Private
router.get('/subscription-status', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get user subscription info
        const userQuery = `
            SELECT subscription_plan, subscription_start_date, subscription_end_date 
            FROM users 
            WHERE id = ?
        `;
        const users = await executeQuery(userQuery, [userId]);
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const user = users[0];
        const now = new Date();
        const endDate = user.subscription_end_date ? new Date(user.subscription_end_date) : null;
        
        const isActive = user.subscription_plan && endDate && endDate > now;
        
        res.json({
            success: true,
            data: {
                plan: user.subscription_plan || 'free',
                is_active: isActive,
                start_date: user.subscription_start_date,
                end_date: user.subscription_end_date,
                days_remaining: isActive ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : 0
            }
        });
        
    } catch (error) {
        console.error('Get subscription status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get subscription status'
        });
    }
});

// @route   POST /api/payments/simulate-payment
// @desc    Simple subscription activation (no real payment)
// @access  Private
router.post('/simulate-payment', authenticateToken, validatePayment, async (req, res) => {
    try {
        const { subscription_plan } = req.body;
        const userId = req.user.id;
        
        // Check if plan exists
        if (!SUBSCRIPTION_PLANS[subscription_plan]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription plan'
            });
        }
        
        const plan = SUBSCRIPTION_PLANS[subscription_plan];
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + plan.duration_days);
        
        // Update user subscription
        await updateUserSubscription(userId, subscription_plan, startDate, endDate);
        
        // Create a simple payment record
        const paymentQuery = `
            INSERT INTO payments (user_id, subscription_plan, amount, payment_method, payment_status, created_at)
            VALUES (?, ?, ?, 'card', 'completed', NOW())
        `;
        await executeQuery(paymentQuery, [userId, subscription_plan, plan.price]);
        
        res.json({
            success: true,
            message: `Successfully activated ${plan.name}`,
            data: {
                plan: subscription_plan,
                start_date: startDate,
                end_date: endDate,
                amount: plan.price,
                features: plan.features
            }
        });
        
    } catch (error) {
        console.error('Simulate payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to activate subscription'
        });
    }
});

// @route   POST /api/payments/process-payment
// @desc    Simple payment processing (same as simulate for now)
// @access  Private
router.post('/process-payment', authenticateToken, validatePayment, async (req, res) => {
    try {
        const { subscription_plan } = req.body;
        const userId = req.user.id;
        
        // Check if plan exists
        if (!SUBSCRIPTION_PLANS[subscription_plan]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription plan'
            });
        }
        
        const plan = SUBSCRIPTION_PLANS[subscription_plan];
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + plan.duration_days);
        
        // Update user subscription
        await updateUserSubscription(userId, subscription_plan, startDate, endDate);
        
        // Create payment record
        const paymentQuery = `
            INSERT INTO payments (user_id, subscription_plan, amount, payment_method, payment_status, created_at)
            VALUES (?, ?, ?, 'card', 'completed', NOW())
        `;
        await executeQuery(paymentQuery, [userId, subscription_plan, plan.price]);
        
        res.json({
            success: true,
            message: `Payment successful! ${plan.name} activated.`,
            data: {
                plan: subscription_plan,
                start_date: startDate,
                end_date: endDate,
                amount: plan.price
            }
        });
        
    } catch (error) {
        console.error('Process payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment processing failed'
        });
    }
});

// @route   GET /api/payments/plans
// @desc    Get available subscription plans
// @access  Public
router.get('/plans', (req, res) => {
    res.json({
        success: true,
        data: SUBSCRIPTION_PLANS
    });
});

// @route   GET /api/payments/history
// @desc    Get user's payment history
// @access  Private
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const paymentsQuery = `
            SELECT id, subscription_plan, amount, payment_method, payment_status, created_at
            FROM payments 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `;
        const payments = await executeQuery(paymentsQuery, [userId]);
        
        res.json({
            success: true,
            data: payments
        });
        
    } catch (error) {
        console.error('Get payment history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get payment history'
        });
    }
});

module.exports = router;
