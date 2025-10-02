// Global error handler middleware
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error
    console.error('Error:', err);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = { message, statusCode: 404 };
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = { message, statusCode: 400 };
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = { message, statusCode: 400 };
    }

    // MySQL duplicate entry error
    if (err.code === 'ER_DUP_ENTRY') {
        const message = 'Duplicate entry - resource already exists';
        error = { message, statusCode: 400 };
    }

    // MySQL foreign key constraint error
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        const message = 'Referenced resource does not exist';
        error = { message, statusCode: 400 };
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        const message = 'Invalid token';
        error = { message, statusCode: 401 };
    }

    if (err.name === 'TokenExpiredError') {
        const message = 'Token expired';
        error = { message, statusCode: 401 };
    }

    // File upload errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        const message = 'File size too large';
        error = { message, statusCode: 400 };
    }

    // Payment errors
    if (err.type === 'StripeCardError') {
        const message = err.message || 'Payment failed';
        error = { message, statusCode: 400 };
    }

    // Database connection errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        const message = 'Database connection failed';
        error = { message, statusCode: 500 };
    }

    // Rate limiting errors
    if (err.status === 429) {
        const message = 'Too many requests, please try again later';
        error = { message, statusCode: 429 };
    }

    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = { errorHandler };
