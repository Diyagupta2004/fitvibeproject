const express = require('express');
const { 
    getWorkouts, 
    getWorkoutCategories,
    recordWorkoutSession,
    getUserWorkoutHistory,
    executeQuery 
} = require('../config/database');
const { 
    authenticateToken, 
    optionalAuth, 
    requireSubscription, 
    requirePremium 
} = require('../middleware/auth');
const { 
    validateWorkoutSession, 
    validateId, 
    validatePagination 
} = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/workouts/categories
// @desc    Get all workout categories
// @access  Public
router.get('/categories', async (req, res) => {
    try {
        const categories = await getWorkoutCategories();
        
        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Get workout categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get workout categories'
        });
    }
});

// @route   GET /api/workouts
// @desc    Get workouts with filters
// @access  Public (with optional auth for premium content)
router.get('/', optionalAuth, validatePagination, async (req, res) => {
    try {
        const { 
            category_id, 
            difficulty_level, 
            search, 
            page = 1, 
            limit = 20,
            is_premium 
        } = req.query;

        // Build filters
        const filters = {};
        
        if (category_id) filters.category_id = parseInt(category_id);
        if (difficulty_level) filters.difficulty_level = difficulty_level;
        if (search) filters.search = search;
        if (limit) filters.limit = parseInt(limit);

        // Handle premium content filtering
        if (req.user) {
            // User is authenticated - check subscription for premium content
            const now = new Date();
            const hasActiveSubscription = req.user.subscription_plan && 
                                        new Date(req.user.subscription_end_date) > now;
            
            if (!hasActiveSubscription && is_premium !== 'false') {
                // Show only free content if no active subscription
                filters.is_premium = false;
            }
        } else {
            // Not authenticated - show only free content
            filters.is_premium = false;
        }

        const workouts = await getWorkouts(filters);

        // Calculate pagination
        const offset = (page - 1) * limit;
        const paginatedWorkouts = workouts.slice(offset, offset + limit);

        // Add subscription requirement info for premium workouts
        const workoutsWithAccess = paginatedWorkouts.map(workout => ({
            ...workout,
            requires_subscription: workout.is_premium && (!req.user || !req.user.subscription_plan || new Date(req.user.subscription_end_date) <= new Date()),
            user_has_access: !workout.is_premium || (req.user && req.user.subscription_plan && new Date(req.user.subscription_end_date) > new Date())
        }));

        res.json({
            success: true,
            data: {
                workouts: workoutsWithAccess,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(workouts.length / limit),
                    total_count: workouts.length,
                    has_next: page < Math.ceil(workouts.length / limit),
                    has_prev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get workouts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get workouts'
        });
    }
});

// @route   GET /api/workouts/:id
// @desc    Get single workout by ID
// @access  Public (with premium check)
router.get('/:id', optionalAuth, validateId, async (req, res) => {
    try {
        const workoutId = req.params.id;
        
        const workoutQuery = `
            SELECT w.*, wc.name as category_name, wc.description as category_description
            FROM workouts w
            LEFT JOIN workout_categories wc ON w.category_id = wc.id
            WHERE w.id = ? AND w.is_active = TRUE
        `;
        
        const workouts = await executeQuery(workoutQuery, [workoutId]);
        
        if (workouts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Workout not found'
            });
        }

        const workout = workouts[0];

        // Check premium access
        if (workout.is_premium) {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required for premium content',
                    code: 'AUTH_REQUIRED'
                });
            }

            const now = new Date();
            const hasActiveSubscription = req.user.subscription_plan && 
                                        new Date(req.user.subscription_end_date) > now;

            if (!hasActiveSubscription) {
                return res.status(403).json({
                    success: false,
                    message: 'Active subscription required for premium content',
                    code: 'SUBSCRIPTION_REQUIRED'
                });
            }
        }

        // Get workout statistics if user is authenticated
        let userStats = null;
        if (req.user) {
            const statsQuery = `
                SELECT 
                    COUNT(*) as times_completed,
                    AVG(duration_minutes) as avg_duration,
                    AVG(calories_burned) as avg_calories,
                    AVG(difficulty_rating) as avg_rating,
                    MAX(completed_at) as last_completed
                FROM user_workout_sessions 
                WHERE user_id = ? AND workout_id = ?
            `;
            const stats = await executeQuery(statsQuery, [req.user.id, workoutId]);
            userStats = stats[0];
        }

        res.json({
            success: true,
            data: {
                ...workout,
                user_stats: userStats,
                requires_subscription: false, // User has access if they reach this point
                user_has_access: true
            }
        });

    } catch (error) {
        console.error('Get workout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get workout'
        });
    }
});

// @route   POST /api/workouts/:id/start
// @desc    Start a workout session
// @access  Private
router.post('/:id/start', authenticateToken, validateId, async (req, res) => {
    try {
        const workoutId = req.params.id;
        
        // Check if workout exists and user has access
        const workoutQuery = `
            SELECT * FROM workouts WHERE id = ? AND is_active = TRUE
        `;
        const workouts = await executeQuery(workoutQuery, [workoutId]);
        
        if (workouts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Workout not found'
            });
        }

        const workout = workouts[0];

        // Check premium access
        if (workout.is_premium) {
            const now = new Date();
            const hasActiveSubscription = req.user.subscription_plan && 
                                        new Date(req.user.subscription_end_date) > now;

            if (!hasActiveSubscription) {
                return res.status(403).json({
                    success: false,
                    message: 'Active subscription required for premium content',
                    code: 'SUBSCRIPTION_REQUIRED'
                });
            }
        }

        // Create a workout session start record (for tracking)
        const sessionQuery = `
            INSERT INTO user_workout_sessions (user_id, workout_id, duration_minutes, calories_burned)
            VALUES (?, ?, 0, 0)
        `;
        const result = await executeQuery(sessionQuery, [req.user.id, workoutId]);

        res.json({
            success: true,
            message: 'Workout session started',
            data: {
                session_id: result.insertId,
                workout: workout,
                started_at: new Date()
            }
        });

    } catch (error) {
        console.error('Start workout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start workout'
        });
    }
});

// @route   POST /api/workouts/:id/complete
// @desc    Complete a workout session
// @access  Private
router.post('/:id/complete', authenticateToken, validateId, validateWorkoutSession, async (req, res) => {
    try {
        const workoutId = req.params.id;
        const { duration_minutes, calories_burned, difficulty_rating, notes } = req.body;

        // Record the completed workout session
        const sessionData = {
            user_id: req.user.id,
            workout_id: workoutId,
            duration_minutes,
            calories_burned,
            difficulty_rating,
            notes
        };

        const result = await recordWorkoutSession(sessionData);

        // Check and award achievements
        await executeQuery('CALL CheckAndAwardAchievements(?)', [req.user.id]);

        res.status(201).json({
            success: true,
            message: 'Workout completed successfully',
            data: {
                session_id: result.insertId,
                ...sessionData,
                completed_at: new Date()
            }
        });

    } catch (error) {
        console.error('Complete workout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete workout'
        });
    }
});

// @route   GET /api/workouts/plans
// @desc    Get workout plans
// @access  Public (with premium filtering)
router.get('/plans/all', optionalAuth, async (req, res) => {
    try {
        let query = `
            SELECT wp.*, u.name as created_by_name
            FROM workout_plans wp
            LEFT JOIN users u ON wp.created_by = u.id
            WHERE wp.is_active = TRUE
        `;

        // Filter premium plans based on user subscription
        if (!req.user || !req.user.subscription_plan || new Date(req.user.subscription_end_date) <= new Date()) {
            query += ' AND wp.is_premium = FALSE';
        }

        query += ' ORDER BY wp.created_at DESC';

        const plans = await executeQuery(query);

        // Get exercise count for each plan
        const plansWithDetails = await Promise.all(
            plans.map(async (plan) => {
                const exerciseCountQuery = `
                    SELECT COUNT(DISTINCT workout_id) as exercise_count
                    FROM workout_plan_exercises 
                    WHERE plan_id = ?
                `;
                const countResult = await executeQuery(exerciseCountQuery, [plan.id]);
                
                return {
                    ...plan,
                    exercise_count: countResult[0].exercise_count,
                    requires_subscription: plan.is_premium && (!req.user || !req.user.subscription_plan || new Date(req.user.subscription_end_date) <= new Date())
                };
            })
        );

        res.json({
            success: true,
            data: plansWithDetails
        });

    } catch (error) {
        console.error('Get workout plans error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get workout plans'
        });
    }
});

// @route   GET /api/workouts/plans/:id
// @desc    Get workout plan details
// @access  Public (with premium check)
router.get('/plans/:id', optionalAuth, validateId, async (req, res) => {
    try {
        const planId = req.params.id;

        // Get plan details
        const planQuery = `
            SELECT wp.*, u.name as created_by_name
            FROM workout_plans wp
            LEFT JOIN users u ON wp.created_by = u.id
            WHERE wp.id = ? AND wp.is_active = TRUE
        `;
        const plans = await executeQuery(planQuery, [planId]);

        if (plans.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Workout plan not found'
            });
        }

        const plan = plans[0];

        // Check premium access
        if (plan.is_premium) {
            if (!req.user || !req.user.subscription_plan || new Date(req.user.subscription_end_date) <= new Date()) {
                return res.status(403).json({
                    success: false,
                    message: 'Premium subscription required for this workout plan',
                    code: 'SUBSCRIPTION_REQUIRED'
                });
            }
        }

        // Get plan exercises
        const exercisesQuery = `
            SELECT wpe.*, w.name as workout_name, w.description, w.duration_minutes,
                   w.difficulty_level, w.image_url, wc.name as category_name
            FROM workout_plan_exercises wpe
            JOIN workouts w ON wpe.workout_id = w.id
            JOIN workout_categories wc ON w.category_id = wc.id
            WHERE wpe.plan_id = ?
            ORDER BY wpe.week_number, wpe.day_number, wpe.order_index
        `;
        const exercises = await executeQuery(exercisesQuery, [planId]);

        // Group exercises by week and day
        const schedule = {};
        exercises.forEach(exercise => {
            const week = exercise.week_number;
            const day = exercise.day_number;
            
            if (!schedule[week]) schedule[week] = {};
            if (!schedule[week][day]) schedule[week][day] = [];
            
            schedule[week][day].push(exercise);
        });

        res.json({
            success: true,
            data: {
                ...plan,
                schedule: schedule,
                total_exercises: exercises.length,
                requires_subscription: false // User has access if they reach this point
            }
        });

    } catch (error) {
        console.error('Get workout plan error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get workout plan'
        });
    }
});

// @route   POST /api/workouts/plans/:id/subscribe
// @desc    Subscribe to a workout plan
// @access  Private
router.post('/plans/:id/subscribe', authenticateToken, validateId, async (req, res) => {
    try {
        const planId = req.params.id;
        const userId = req.user.id;

        // Check if plan exists
        const planQuery = `
            SELECT * FROM workout_plans WHERE id = ? AND is_active = TRUE
        `;
        const plans = await executeQuery(planQuery, [planId]);

        if (plans.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Workout plan not found'
            });
        }

        const plan = plans[0];

        // Check premium access
        if (plan.is_premium) {
            const now = new Date();
            const hasActiveSubscription = req.user.subscription_plan && 
                                        new Date(req.user.subscription_end_date) > now;

            if (!hasActiveSubscription) {
                return res.status(403).json({
                    success: false,
                    message: 'Premium subscription required for this workout plan',
                    code: 'SUBSCRIPTION_REQUIRED'
                });
            }
        }

        // Check if user is already subscribed to this plan
        const existingQuery = `
            SELECT * FROM user_workout_plans 
            WHERE user_id = ? AND plan_id = ? AND is_active = TRUE
        `;
        const existing = await executeQuery(existingQuery, [userId, planId]);

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Already subscribed to this workout plan'
            });
        }

        // Subscribe to the plan
        const subscribeQuery = `
            INSERT INTO user_workout_plans (user_id, plan_id)
            VALUES (?, ?)
        `;
        const result = await executeQuery(subscribeQuery, [userId, planId]);

        res.status(201).json({
            success: true,
            message: 'Successfully subscribed to workout plan',
            data: {
                subscription_id: result.insertId,
                plan_id: planId,
                started_at: new Date(),
                current_week: 1,
                current_day: 1
            }
        });

    } catch (error) {
        console.error('Subscribe to workout plan error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to subscribe to workout plan'
        });
    }
});

// @route   GET /api/workouts/my-plans
// @desc    Get user's subscribed workout plans
// @access  Private
router.get('/my-plans', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const myPlansQuery = `
            SELECT uwp.*, wp.name, wp.description, wp.duration_weeks, 
                   wp.difficulty_level, wp.goals, u.name as created_by_name
            FROM user_workout_plans uwp
            JOIN workout_plans wp ON uwp.plan_id = wp.id
            LEFT JOIN users u ON wp.created_by = u.id
            WHERE uwp.user_id = ? AND uwp.is_active = TRUE
            ORDER BY uwp.started_at DESC
        `;

        const myPlans = await executeQuery(myPlansQuery, [userId]);

        // Calculate progress for each plan
        const plansWithProgress = await Promise.all(
            myPlans.map(async (plan) => {
                const totalWeeks = plan.duration_weeks;
                const currentWeek = plan.current_week;
                const progressPercentage = Math.round((currentWeek / totalWeeks) * 100);

                // Get completed sessions for this plan
                const completedQuery = `
                    SELECT COUNT(*) as completed_sessions
                    FROM user_workout_sessions uws
                    JOIN workout_plan_exercises wpe ON uws.workout_id = wpe.workout_id
                    WHERE uws.user_id = ? AND wpe.plan_id = ?
                    AND uws.completed_at >= ?
                `;
                const completedResult = await executeQuery(completedQuery, [userId, plan.plan_id, plan.started_at]);

                return {
                    ...plan,
                    progress_percentage: progressPercentage,
                    completed_sessions: completedResult[0].completed_sessions,
                    is_completed: plan.completed_at !== null,
                    days_active: Math.ceil((new Date() - new Date(plan.started_at)) / (1000 * 60 * 60 * 24))
                };
            })
        );

        res.json({
            success: true,
            data: plansWithProgress
        });

    } catch (error) {
        console.error('Get my workout plans error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get workout plans'
        });
    }
});

// @route   PUT /api/workouts/plans/:id/progress
// @desc    Update workout plan progress
// @access  Private
router.put('/plans/:id/progress', authenticateToken, validateId, async (req, res) => {
    try {
        const planId = req.params.id;
        const userId = req.user.id;
        const { current_week, current_day } = req.body;

        // Validate input
        if (!current_week || !current_day) {
            return res.status(400).json({
                success: false,
                message: 'Current week and day are required'
            });
        }

        // Check if user is subscribed to this plan
        const subscriptionQuery = `
            SELECT * FROM user_workout_plans 
            WHERE user_id = ? AND plan_id = ? AND is_active = TRUE
        `;
        const subscription = await executeQuery(subscriptionQuery, [userId, planId]);

        if (subscription.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Workout plan subscription not found'
            });
        }

        // Update progress
        const updateQuery = `
            UPDATE user_workout_plans 
            SET current_week = ?, current_day = ?
            WHERE user_id = ? AND plan_id = ?
        `;
        await executeQuery(updateQuery, [current_week, current_day, userId, planId]);

        res.json({
            success: true,
            message: 'Workout plan progress updated successfully'
        });

    } catch (error) {
        console.error('Update workout plan progress error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update workout plan progress'
        });
    }
});

// @route   GET /api/workouts/search
// @desc    Search workouts
// @access  Public
router.get('/search', optionalAuth, async (req, res) => {
    try {
        const { q, category, difficulty, limit = 20 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters long'
            });
        }

        let query = `
            SELECT w.*, wc.name as category_name
            FROM workouts w
            LEFT JOIN workout_categories wc ON w.category_id = wc.id
            WHERE w.is_active = TRUE
            AND (w.name LIKE ? OR w.description LIKE ? OR wc.name LIKE ?)
        `;

        const params = [`%${q}%`, `%${q}%`, `%${q}%`];

        // Add filters
        if (category) {
            query += ' AND w.category_id = ?';
            params.push(category);
        }

        if (difficulty) {
            query += ' AND w.difficulty_level = ?';
            params.push(difficulty);
        }

        // Filter premium content for non-subscribers
        if (!req.user || !req.user.subscription_plan || new Date(req.user.subscription_end_date) <= new Date()) {
            query += ' AND w.is_premium = FALSE';
        }

        query += ' ORDER BY w.name LIMIT ?';
        params.push(parseInt(limit));

        const searchResults = await executeQuery(query, params);

        res.json({
            success: true,
            data: {
                results: searchResults,
                query: q,
                total_results: searchResults.length
            }
        });

    } catch (error) {
        console.error('Search workouts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search workouts'
        });
    }
});

module.exports = router;
