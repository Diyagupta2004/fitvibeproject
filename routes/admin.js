const express = require('express');
const bcrypt = require('bcryptjs');
const { 
    getAdminDashboardStats,
    executeQuery,
    createUser,
    updateUser
} = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Admin
router.get('/dashboard', async (req, res) => {
    try {
        const stats = await getAdminDashboardStats();

        // Get additional statistics
        const additionalQueries = [
            // New users this month
            `SELECT COUNT(*) as new_users_this_month 
             FROM users 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)`,
            
            // Revenue this month
            `SELECT SUM(amount) as revenue_this_month 
             FROM payments 
             WHERE payment_status = 'completed' 
             AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)`,
            
            // Most popular workout category
            `SELECT wc.name as category_name, COUNT(uws.id) as session_count
             FROM user_workout_sessions uws
             JOIN workouts w ON uws.workout_id = w.id
             JOIN workout_categories wc ON w.category_id = wc.id
             WHERE uws.completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY wc.id
             ORDER BY session_count DESC
             LIMIT 1`,
            
            // Subscription distribution
            `SELECT subscription_plan, COUNT(*) as count
             FROM users 
             WHERE subscription_plan IS NOT NULL 
             AND subscription_end_date > NOW()
             GROUP BY subscription_plan`
        ];

        const [
            newUsersResult,
            revenueResult,
            popularCategoryResult,
            subscriptionDistResult
        ] = await Promise.all(
            additionalQueries.map(query => executeQuery(query))
        );

        const dashboardData = {
            ...stats,
            new_users_this_month: newUsersResult[0]?.new_users_this_month || 0,
            revenue_this_month: revenueResult[0]?.revenue_this_month || 0,
            most_popular_category: popularCategoryResult[0]?.category_name || 'N/A',
            subscription_distribution: subscriptionDistResult
        };

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        console.error('Get admin dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard data'
        });
    }
});

// @route   GET /api/admin/users
// @desc    Get all users with pagination and filters
// @access  Admin
router.get('/users', validatePagination, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const { search, subscription_plan, is_active } = req.query;

        let query = `
            SELECT u.id, u.name, u.email, u.role, u.subscription_plan, 
                   u.subscription_start_date, u.subscription_end_date, 
                   u.is_active, u.created_at, up.fitness_level
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE 1=1
        `;
        const params = [];

        // Add search filter
        if (search) {
            query += ' AND (u.name LIKE ? OR u.email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Add subscription filter
        if (subscription_plan) {
            query += ' AND u.subscription_plan = ?';
            params.push(subscription_plan);
        }

        // Add active status filter
        if (is_active !== undefined) {
            query += ' AND u.is_active = ?';
            params.push(is_active === 'true');
        }

        query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const users = await executeQuery(query, params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM users u WHERE 1=1';
        const countParams = [];

        if (search) {
            countQuery += ' AND (u.name LIKE ? OR u.email LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }
        if (subscription_plan) {
            countQuery += ' AND u.subscription_plan = ?';
            countParams.push(subscription_plan);
        }
        if (is_active !== undefined) {
            countQuery += ' AND u.is_active = ?';
            countParams.push(is_active === 'true');
        }

        const countResult = await executeQuery(countQuery, countParams);
        const totalCount = countResult[0].total;

        res.json({
            success: true,
            data: {
                users: users,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(totalCount / limit),
                    total_count: totalCount,
                    has_next: page < Math.ceil(totalCount / limit),
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get users'
        });
    }
});

// @route   GET /api/admin/users/:id
// @desc    Get user details by ID
// @access  Admin
router.get('/users/:id', validateId, async (req, res) => {
    try {
        const userId = req.params.id;

        const userQuery = `
            SELECT u.*, up.age, up.gender, up.height_cm, up.weight_kg, 
                   up.fitness_level, up.fitness_goals, up.profile_picture,
                   up.phone, up.address, up.emergency_contact, up.medical_conditions
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE u.id = ?
        `;
        const users = await executeQuery(userQuery, [userId]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Get user statistics
        const statsQueries = [
            `SELECT COUNT(*) as total_workouts FROM user_workout_sessions WHERE user_id = ?`,
            `SELECT COUNT(*) as total_bmi_records FROM bmi_records WHERE user_id = ?`,
            `SELECT COUNT(*) as total_payments FROM payments WHERE user_id = ?`,
            `SELECT SUM(amount) as total_spent FROM payments WHERE user_id = ? AND payment_status = 'completed'`
        ];

        const [
            workoutsResult,
            bmiResult,
            paymentsResult,
            spentResult
        ] = await Promise.all(
            statsQueries.map(query => executeQuery(query, [userId]))
        );

        const userStats = {
            total_workouts: workoutsResult[0].total_workouts,
            total_bmi_records: bmiResult[0].total_bmi_records,
            total_payments: paymentsResult[0].total_payments,
            total_spent: spentResult[0].total_spent || 0
        };

        // Remove sensitive data
        const { password_hash, email_verification_token, password_reset_token, ...userData } = user;

        res.json({
            success: true,
            data: {
                ...userData,
                stats: userStats
            }
        });

    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user details'
        });
    }
});

// @route   PUT /api/admin/users/:id
// @desc    Update user (admin can update any field)
// @access  Admin
router.put('/users/:id', validateId, async (req, res) => {
    try {
        const userId = req.params.id;
        const { 
            name, 
            email, 
            role, 
            subscription_plan, 
            subscription_start_date, 
            subscription_end_date, 
            is_active 
        } = req.body;

        // Check if user exists
        const existingUser = await executeQuery('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Build update object
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (role !== undefined) updateData.role = role;
        if (subscription_plan !== undefined) updateData.subscription_plan = subscription_plan;
        if (subscription_start_date !== undefined) updateData.subscription_start_date = subscription_start_date;
        if (subscription_end_date !== undefined) updateData.subscription_end_date = subscription_end_date;
        if (is_active !== undefined) updateData.is_active = is_active;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        // Update user
        await updateUser(userId, updateData);

        res.json({
            success: true,
            message: 'User updated successfully'
        });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user'
        });
    }
});

// @route   POST /api/admin/users
// @desc    Create new user (admin)
// @access  Admin
router.post('/users', async (req, res) => {
    try {
        const { name, email, password, role = 'user' } = req.body;

        // Validate required fields
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and password are required'
            });
        }

        // Check if user already exists
        const existingUser = await executeQuery('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Hash password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Create user
        const userId = await createUser({
            name,
            email,
            password_hash,
            role
        });

        // Create user profile
        await executeQuery('INSERT INTO user_profiles (user_id) VALUES (?)', [userId]);

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                id: userId,
                name,
                email,
                role
            }
        });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create user'
        });
    }
});

// @route   GET /api/admin/workouts
// @desc    Get all workouts for admin management
// @access  Admin
router.get('/workouts', validatePagination, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const workoutsQuery = `
            SELECT w.*, wc.name as category_name,
                   COUNT(uws.id) as total_sessions
            FROM workouts w
            LEFT JOIN workout_categories wc ON w.category_id = wc.id
            LEFT JOIN user_workout_sessions uws ON w.id = uws.workout_id
            GROUP BY w.id
            ORDER BY w.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const workouts = await executeQuery(workoutsQuery, [limit, offset]);

        // Get total count
        const countResult = await executeQuery('SELECT COUNT(*) as total FROM workouts');
        const totalCount = countResult[0].total;

        res.json({
            success: true,
            data: {
                workouts: workouts,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(totalCount / limit),
                    total_count: totalCount,
                    has_next: page < Math.ceil(totalCount / limit),
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get admin workouts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get workouts'
        });
    }
});

// @route   POST /api/admin/workouts
// @desc    Create new workout
// @access  Admin
router.post('/workouts', async (req, res) => {
    try {
        const {
            category_id,
            name,
            description,
            instructions,
            duration_minutes,
            difficulty_level,
            calories_burned_estimate,
            equipment_needed,
            video_url,
            image_url,
            is_premium = false
        } = req.body;

        // Validate required fields
        if (!category_id || !name || !difficulty_level) {
            return res.status(400).json({
                success: false,
                message: 'Category ID, name, and difficulty level are required'
            });
        }

        const insertQuery = `
            INSERT INTO workouts (
                category_id, name, description, instructions, duration_minutes,
                difficulty_level, calories_burned_estimate, equipment_needed,
                video_url, image_url, is_premium
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const result = await executeQuery(insertQuery, [
            category_id, name, description, instructions, duration_minutes,
            difficulty_level, calories_burned_estimate, equipment_needed,
            video_url, image_url, is_premium
        ]);

        res.status(201).json({
            success: true,
            message: 'Workout created successfully',
            data: {
                id: result.insertId,
                name,
                difficulty_level,
                is_premium
            }
        });

    } catch (error) {
        console.error('Create workout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create workout'
        });
    }
});

// @route   PUT /api/admin/workouts/:id
// @desc    Update workout
// @access  Admin
router.put('/workouts/:id', validateId, async (req, res) => {
    try {
        const workoutId = req.params.id;
        const updateFields = req.body;

        // Remove undefined fields
        Object.keys(updateFields).forEach(key => {
            if (updateFields[key] === undefined) {
                delete updateFields[key];
            }
        });

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        const fields = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updateFields);

        const updateQuery = `UPDATE workouts SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        await executeQuery(updateQuery, [...values, workoutId]);

        res.json({
            success: true,
            message: 'Workout updated successfully'
        });

    } catch (error) {
        console.error('Update workout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update workout'
        });
    }
});

// @route   DELETE /api/admin/workouts/:id
// @desc    Delete workout (soft delete)
// @access  Admin
router.delete('/workouts/:id', validateId, async (req, res) => {
    try {
        const workoutId = req.params.id;

        await executeQuery('UPDATE workouts SET is_active = FALSE WHERE id = ?', [workoutId]);

        res.json({
            success: true,
            message: 'Workout deleted successfully'
        });

    } catch (error) {
        console.error('Delete workout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete workout'
        });
    }
});

// @route   GET /api/admin/payments
// @desc    Get all payments
// @access  Admin
router.get('/payments', validatePagination, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const paymentsQuery = `
            SELECT p.*, u.name as user_name, u.email as user_email
            FROM payments p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const payments = await executeQuery(paymentsQuery, [limit, offset]);

        // Get total count
        const countResult = await executeQuery('SELECT COUNT(*) as total FROM payments');
        const totalCount = countResult[0].total;

        res.json({
            success: true,
            data: {
                payments: payments,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(totalCount / limit),
                    total_count: totalCount,
                    has_next: page < Math.ceil(totalCount / limit),
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get admin payments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get payments'
        });
    }
});

// @route   GET /api/admin/contact-submissions
// @desc    Get contact form submissions
// @access  Admin
router.get('/contact-submissions', validatePagination, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const { status } = req.query;

        let query = 'SELECT * FROM contact_submissions WHERE 1=1';
        const params = [];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY submitted_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const submissions = await executeQuery(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM contact_submissions WHERE 1=1';
        const countParams = [];
        if (status) {
            countQuery += ' AND status = ?';
            countParams.push(status);
        }

        const countResult = await executeQuery(countQuery, countParams);
        const totalCount = countResult[0].total;

        res.json({
            success: true,
            data: {
                submissions: submissions,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(totalCount / limit),
                    total_count: totalCount,
                    has_next: page < Math.ceil(totalCount / limit),
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get contact submissions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get contact submissions'
        });
    }
});

// @route   PUT /api/admin/contact-submissions/:id
// @desc    Update contact submission status
// @access  Admin
router.put('/contact-submissions/:id', validateId, async (req, res) => {
    try {
        const submissionId = req.params.id;
        const { status, admin_notes } = req.body;

        const updateQuery = `
            UPDATE contact_submissions 
            SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `;

        await executeQuery(updateQuery, [status, admin_notes, submissionId]);

        res.json({
            success: true,
            message: 'Contact submission updated successfully'
        });

    } catch (error) {
        console.error('Update contact submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update contact submission'
        });
    }
});

module.exports = router;
