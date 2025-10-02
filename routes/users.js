const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { 
    getUserById, 
    updateUser, 
    upsertUserProfile,
    getUserWorkoutHistory,
    executeQuery 
} = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateUserProfile, validateId } = require('../middleware/validation');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = 'uploads/profiles';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
        }
    }
});

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await getUserById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Remove sensitive data
        const { password_hash, email_verification_token, password_reset_token, ...userData } = user;
        
        res.json({
            success: true,
            data: userData
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get profile'
        });
    }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticateToken, validateUserProfile, async (req, res) => {
    try {
        const { name, age, gender, height_cm, weight_kg, fitness_level, fitness_goals, phone, address } = req.body;
        
        // Update user basic info
        if (name) {
            await updateUser(req.user.id, { name });
        }

        // Update profile info
        const profileData = {
            age,
            gender,
            height_cm,
            weight_kg,
            fitness_level,
            fitness_goals,
            phone,
            address
        };

        // Remove undefined values
        Object.keys(profileData).forEach(key => {
            if (profileData[key] === undefined) {
                delete profileData[key];
            }
        });

        if (Object.keys(profileData).length > 0) {
            await upsertUserProfile(req.user.id, profileData);
        }

        // Get updated user data
        const updatedUser = await getUserById(req.user.id);
        const { password_hash, email_verification_token, password_reset_token, ...userData } = updatedUser;

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: userData
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
});

// @route   POST /api/users/profile/picture
// @desc    Upload profile picture
// @access  Private
router.post('/profile/picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const profilePictureUrl = `/uploads/profiles/${req.file.filename}`;

        // Update user profile with new picture URL
        await upsertUserProfile(req.user.id, { profile_picture: profilePictureUrl });

        res.json({
            success: true,
            message: 'Profile picture updated successfully',
            data: {
                profile_picture: profilePictureUrl
            }
        });
    } catch (error) {
        console.error('Upload profile picture error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload profile picture'
        });
    }
});

// @route   GET /api/users/dashboard
// @desc    Get user dashboard data
// @access  Private
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get dashboard stats
        const statsQueries = [
            // Total workouts completed
            `SELECT COUNT(*) as total_workouts FROM user_workout_sessions WHERE user_id = ?`,
            
            // Workouts this week
            `SELECT COUNT(*) as weekly_workouts FROM user_workout_sessions 
             WHERE user_id = ? AND completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
            
            // Total calories burned
            `SELECT SUM(calories_burned) as total_calories FROM user_workout_sessions 
             WHERE user_id = ? AND calories_burned IS NOT NULL`,
            
            // Current streak (consecutive days with workouts)
            `SELECT COUNT(DISTINCT DATE(completed_at)) as workout_days 
             FROM user_workout_sessions 
             WHERE user_id = ? AND completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
            
            // Latest BMI
            `SELECT bmi_value, bmi_category, recorded_at FROM bmi_records 
             WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`
        ];

        const [
            totalWorkoutsResult,
            weeklyWorkoutsResult,
            totalCaloriesResult,
            workoutDaysResult,
            latestBMIResult
        ] = await Promise.all(
            statsQueries.map(query => executeQuery(query, [userId]))
        );

        // Get recent workout history
        const recentWorkouts = await getUserWorkoutHistory(userId, 5);

        // Get achievements
        const achievementsQuery = `
            SELECT a.name, a.description, a.icon_url, a.points, ua.earned_at
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = ?
            ORDER BY ua.earned_at DESC
            LIMIT 10
        `;
        const achievements = await executeQuery(achievementsQuery, [userId]);

        const dashboardData = {
            stats: {
                total_workouts: totalWorkoutsResult[0]?.total_workouts || 0,
                weekly_workouts: weeklyWorkoutsResult[0]?.weekly_workouts || 0,
                total_calories: totalCaloriesResult[0]?.total_calories || 0,
                workout_days: workoutDaysResult[0]?.workout_days || 0,
                current_bmi: latestBMIResult[0] || null
            },
            recent_workouts: recentWorkouts,
            achievements: achievements,
            subscription: {
                plan: req.user.subscription_plan,
                start_date: req.user.subscription_start_date,
                end_date: req.user.subscription_end_date,
                is_active: req.user.subscription_end_date && new Date(req.user.subscription_end_date) > new Date()
            }
        };

        res.json({
            success: true,
            data: dashboardData
        });
    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard data'
        });
    }
});

// @route   GET /api/users/workout-history
// @desc    Get user workout history with pagination
// @access  Private
router.get('/workout-history', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const workoutHistory = await executeQuery(`
            SELECT uws.*, w.name as workout_name, w.difficulty_level, 
                   wc.name as category_name, w.image_url
            FROM user_workout_sessions uws
            JOIN workouts w ON uws.workout_id = w.id
            JOIN workout_categories wc ON w.category_id = wc.id
            WHERE uws.user_id = ?
            ORDER BY uws.completed_at DESC
            LIMIT ? OFFSET ?
        `, [req.user.id, limit, offset]);

        // Get total count for pagination
        const totalCountResult = await executeQuery(
            'SELECT COUNT(*) as total FROM user_workout_sessions WHERE user_id = ?',
            [req.user.id]
        );
        const totalCount = totalCountResult[0].total;

        res.json({
            success: true,
            data: {
                workouts: workoutHistory,
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
        console.error('Get workout history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get workout history'
        });
    }
});

// @route   GET /api/users/achievements
// @desc    Get user achievements
// @access  Private
router.get('/achievements', authenticateToken, async (req, res) => {
    try {
        // Get earned achievements
        const earnedQuery = `
            SELECT a.*, ua.earned_at
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = ?
            ORDER BY ua.earned_at DESC
        `;
        const earnedAchievements = await executeQuery(earnedQuery, [req.user.id]);

        // Get available achievements (not yet earned)
        const availableQuery = `
            SELECT a.*
            FROM achievements a
            WHERE a.is_active = TRUE
            AND a.id NOT IN (
                SELECT achievement_id FROM user_achievements WHERE user_id = ?
            )
            ORDER BY a.points ASC
        `;
        const availableAchievements = await executeQuery(availableQuery, [req.user.id]);

        res.json({
            success: true,
            data: {
                earned: earnedAchievements,
                available: availableAchievements,
                total_points: earnedAchievements.reduce((sum, achievement) => sum + achievement.points, 0)
            }
        });
    } catch (error) {
        console.error('Get achievements error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get achievements'
        });
    }
});

// @route   GET /api/users/progress-photos
// @desc    Get user progress photos
// @access  Private
router.get('/progress-photos', authenticateToken, async (req, res) => {
    try {
        const progressPhotos = await executeQuery(`
            SELECT * FROM progress_photos 
            WHERE user_id = ? 
            ORDER BY taken_at DESC
        `, [req.user.id]);

        res.json({
            success: true,
            data: progressPhotos
        });
    } catch (error) {
        console.error('Get progress photos error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get progress photos'
        });
    }
});

// @route   POST /api/users/progress-photos
// @desc    Upload progress photo
// @access  Private
router.post('/progress-photos', authenticateToken, upload.single('progressPhoto'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const { weight_kg, notes } = req.body;
        const photoUrl = `/uploads/profiles/${req.file.filename}`;

        const insertQuery = `
            INSERT INTO progress_photos (user_id, photo_url, weight_kg, notes)
            VALUES (?, ?, ?, ?)
        `;
        
        const result = await executeQuery(insertQuery, [
            req.user.id,
            photoUrl,
            weight_kg || null,
            notes || null
        ]);

        res.status(201).json({
            success: true,
            message: 'Progress photo uploaded successfully',
            data: {
                id: result.insertId,
                photo_url: photoUrl,
                weight_kg: weight_kg || null,
                notes: notes || null,
                taken_at: new Date()
            }
        });
    } catch (error) {
        console.error('Upload progress photo error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload progress photo'
        });
    }
});

// @route   DELETE /api/users/progress-photos/:id
// @desc    Delete progress photo
// @access  Private
router.delete('/progress-photos/:id', authenticateToken, validateId, async (req, res) => {
    try {
        const photoId = req.params.id;

        // Check if photo belongs to user
        const photo = await executeQuery(
            'SELECT * FROM progress_photos WHERE id = ? AND user_id = ?',
            [photoId, req.user.id]
        );

        if (photo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Progress photo not found'
            });
        }

        // Delete from database
        await executeQuery('DELETE FROM progress_photos WHERE id = ?', [photoId]);

        // Delete file from filesystem
        const filePath = path.join(__dirname, '..', photo[0].photo_url);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({
            success: true,
            message: 'Progress photo deleted successfully'
        });
    } catch (error) {
        console.error('Delete progress photo error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete progress photo'
        });
    }
});

// @route   DELETE /api/users/account
// @desc    Deactivate user account
// @access  Private
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required to deactivate account'
            });
        }

        // Verify password
        const bcrypt = require('bcryptjs');
        const isPasswordValid = await bcrypt.compare(password, req.user.password_hash);
        
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid password'
            });
        }

        // Deactivate account (soft delete)
        await updateUser(req.user.id, { is_active: false });

        res.json({
            success: true,
            message: 'Account deactivated successfully'
        });
    } catch (error) {
        console.error('Deactivate account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to deactivate account'
        });
    }
});

module.exports = router;
