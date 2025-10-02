// 404 Not Found middleware
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
        availableRoutes: {
            auth: '/api/auth',
            users: '/api/users',
            workouts: '/api/workouts',
            payments: '/api/payments',
            admin: '/api/admin',
            bmi: '/api/bmi',
            contact: '/api/contact'
        }
    });
};

module.exports = { notFound };
