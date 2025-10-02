const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

// User registration validation
const validateUserRegistration = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    handleValidationErrors
];

// User login validation
const validateUserLogin = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    handleValidationErrors
];

// Password reset request validation
const validatePasswordResetRequest = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    handleValidationErrors
];

// Password reset validation
const validatePasswordReset = [
    body('token')
        .notEmpty()
        .withMessage('Reset token is required'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    handleValidationErrors
];

// User profile validation
const validateUserProfile = [
    body('age')
        .optional()
        .isInt({ min: 13, max: 120 })
        .withMessage('Age must be between 13 and 120'),
    body('gender')
        .optional()
        .isIn(['male', 'female', 'other'])
        .withMessage('Gender must be male, female, or other'),
    body('height_cm')
        .optional()
        .isFloat({ min: 50, max: 300 })
        .withMessage('Height must be between 50 and 300 cm'),
    body('weight_kg')
        .optional()
        .isFloat({ min: 20, max: 500 })
        .withMessage('Weight must be between 20 and 500 kg'),
    body('fitness_level')
        .optional()
        .isIn(['beginner', 'intermediate', 'advanced'])
        .withMessage('Fitness level must be beginner, intermediate, or advanced'),
    body('phone')
        .optional()
        .isMobilePhone()
        .withMessage('Please provide a valid phone number'),
    handleValidationErrors
];

// BMI validation
const validateBMI = [
    body('height_cm')
        .isFloat({ min: 50, max: 300 })
        .withMessage('Height must be between 50 and 300 cm'),
    body('weight_kg')
        .isFloat({ min: 20, max: 500 })
        .withMessage('Weight must be between 20 and 500 kg'),
    handleValidationErrors
];

// Workout session validation
const validateWorkoutSession = [
    body('workout_id')
        .isInt({ min: 1 })
        .withMessage('Valid workout ID is required'),
    body('duration_minutes')
        .optional()
        .isInt({ min: 1, max: 300 })
        .withMessage('Duration must be between 1 and 300 minutes'),
    body('calories_burned')
        .optional()
        .isInt({ min: 1, max: 2000 })
        .withMessage('Calories burned must be between 1 and 2000'),
    body('difficulty_rating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Difficulty rating must be between 1 and 5'),
    handleValidationErrors
];

// Simple payment validation (just check if subscription plan is provided)
const validatePayment = [
    body('subscription_plan')
        .notEmpty()
        .withMessage('Subscription plan is required'),
    handleValidationErrors
];

// Contact form validation
const validateContact = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('subject')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Subject must be less than 200 characters'),
    body('message')
        .trim()
        .isLength({ min: 10, max: 1000 })
        .withMessage('Message must be between 10 and 1000 characters'),
    handleValidationErrors
];

// ID parameter validation
const validateId = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Valid ID is required'),
    handleValidationErrors
];

// Pagination validation
const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    validateUserRegistration,
    validateUserLogin,
    validatePasswordResetRequest,
    validatePasswordReset,
    validateUserProfile,
    validateBMI,
    validateWorkoutSession,
    validatePayment,
    validateContact,
    validateId,
    validatePagination
};
