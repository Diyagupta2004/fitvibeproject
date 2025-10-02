const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fitvibe',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionLimit: 10,
    charset: 'utf8mb4'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
};

// Execute query with error handling
const executeQuery = async (query, params = []) => {
    try {
        const [results] = await pool.execute(query, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

// Execute transaction
const executeTransaction = async (queries) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const results = [];
        for (const { query, params } of queries) {
            const [result] = await connection.execute(query, params || []);
            results.push(result);
        }
        
        await connection.commit();
        return results;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// Get user by email
const getUserByEmail = async (email) => {
    const query = 'SELECT * FROM users WHERE email = ? AND is_active = TRUE';
    const results = await executeQuery(query, [email]);
    return results[0] || null;
};

// Get user by ID
const getUserById = async (id) => {
    const query = `
        SELECT u.*, up.age, up.gender, up.height_cm, up.weight_kg, 
               up.fitness_level, up.fitness_goals, up.profile_picture,
               up.phone, up.address
        FROM users u
        LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE u.id = ? AND u.is_active = TRUE
    `;
    const results = await executeQuery(query, [id]);
    return results[0] || null;
};

// Create new user
const createUser = async (userData) => {
    const { name, email, password_hash, role = 'user' } = userData;
    const query = `
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
    `;
    const result = await executeQuery(query, [name, email, password_hash, role]);
    return result.insertId;
};

// Update user
const updateUser = async (id, userData) => {
    const fields = Object.keys(userData).map(key => `${key} = ?`).join(', ');
    const values = Object.values(userData);
    const query = `UPDATE users SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    return await executeQuery(query, [...values, id]);
};

// Create or update user profile
const upsertUserProfile = async (userId, profileData) => {
    const query = `
        INSERT INTO user_profiles (user_id, age, gender, height_cm, weight_kg, 
                                 fitness_level, fitness_goals, phone, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        age = VALUES(age),
        gender = VALUES(gender),
        height_cm = VALUES(height_cm),
        weight_kg = VALUES(weight_kg),
        fitness_level = VALUES(fitness_level),
        fitness_goals = VALUES(fitness_goals),
        phone = VALUES(phone),
        address = VALUES(address),
        updated_at = CURRENT_TIMESTAMP
    `;
    
    const { age, gender, height_cm, weight_kg, fitness_level, fitness_goals, phone, address } = profileData;
    return await executeQuery(query, [userId, age, gender, height_cm, weight_kg, fitness_level, fitness_goals, phone, address]);
};

// Get workouts with filters
const getWorkouts = async (filters = {}) => {
    let query = `
        SELECT w.*, wc.name as category_name, wc.description as category_description
        FROM workouts w
        LEFT JOIN workout_categories wc ON w.category_id = wc.id
        WHERE w.is_active = TRUE
    `;
    
    const params = [];
    
    if (filters.category_id) {
        query += ' AND w.category_id = ?';
        params.push(filters.category_id);
    }
    
    if (filters.difficulty_level) {
        query += ' AND w.difficulty_level = ?';
        params.push(filters.difficulty_level);
    }
    
    if (filters.is_premium !== undefined) {
        query += ' AND w.is_premium = ?';
        params.push(filters.is_premium);
    }
    
    if (filters.search) {
        query += ' AND (w.name LIKE ? OR w.description LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    
    query += ' ORDER BY w.created_at DESC';
    
    if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit));
    }
    
    return await executeQuery(query, params);
};

// Get workout categories
const getWorkoutCategories = async () => {
    const query = 'SELECT * FROM workout_categories WHERE is_active = TRUE ORDER BY name';
    return await executeQuery(query);
};

// Record workout session
const recordWorkoutSession = async (sessionData) => {
    const { user_id, workout_id, duration_minutes, calories_burned, difficulty_rating, notes } = sessionData;
    const query = `
        INSERT INTO user_workout_sessions 
        (user_id, workout_id, duration_minutes, calories_burned, difficulty_rating, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    return await executeQuery(query, [user_id, workout_id, duration_minutes, calories_burned, difficulty_rating, notes]);
};

// Get user workout history
const getUserWorkoutHistory = async (userId, limit = 50) => {
    const query = `
        SELECT uws.*, w.name as workout_name, w.difficulty_level, 
               wc.name as category_name
        FROM user_workout_sessions uws
        JOIN workouts w ON uws.workout_id = w.id
        JOIN workout_categories wc ON w.category_id = wc.id
        WHERE uws.user_id = ?
        ORDER BY uws.completed_at DESC
        LIMIT ?
    `;
    return await executeQuery(query, [userId, limit]);
};

// Record BMI
const recordBMI = async (userId, height_cm, weight_kg) => {
    // Calculate BMI
    const height_m = height_cm / 100;
    const bmi_value = weight_kg / (height_m * height_m);
    
    // Determine BMI category
    let bmi_category = 'normal';
    if (bmi_value < 18.5) {
        bmi_category = 'underweight';
    } else if (bmi_value >= 25 && bmi_value < 30) {
        bmi_category = 'overweight';
    } else if (bmi_value >= 30) {
        bmi_category = 'obese';
    }
    
    // Insert BMI record
    const query = `
        INSERT INTO bmi_records (user_id, height_cm, weight_kg, bmi_value, bmi_category, recorded_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    `;
    return await executeQuery(query, [userId, height_cm, weight_kg, Math.round(bmi_value * 100) / 100, bmi_category]);
};

// Get user BMI history
const getUserBMIHistory = async (userId, limit = 20) => {
    const query = `
        SELECT * FROM bmi_records 
        WHERE user_id = ? 
        ORDER BY recorded_at DESC 
        LIMIT ?
    `;
    return await executeQuery(query, [userId, limit]);
};

// Create payment record
const createPayment = async (paymentData) => {
    const { user_id, subscription_plan, amount, currency, payment_method, transaction_id } = paymentData;
    const query = `
        INSERT INTO payments (user_id, subscription_plan, amount, currency, payment_method, transaction_id)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    const result = await executeQuery(query, [user_id, subscription_plan, amount, currency, payment_method, transaction_id]);
    return result.insertId;
};

// Update payment status
const updatePaymentStatus = async (paymentId, status, gatewayResponse = null) => {
    const query = `
        UPDATE payments 
        SET payment_status = ?, payment_gateway_response = ?, 
            paid_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE paid_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `;
    return await executeQuery(query, [status, gatewayResponse, status, paymentId]);
};

// Update user subscription
const updateUserSubscription = async (userId, subscriptionPlan, startDate, endDate) => {
    const query = `
        UPDATE users 
        SET subscription_plan = ?, subscription_start_date = ?, subscription_end_date = ?
        WHERE id = ?
    `;
    return await executeQuery(query, [subscriptionPlan, startDate, endDate, userId]);
};

// Get dashboard stats for admin
const getAdminDashboardStats = async () => {
    const queries = [
        'SELECT COUNT(*) as total_users FROM users WHERE is_active = TRUE',
        'SELECT COUNT(*) as total_workouts FROM workouts WHERE is_active = TRUE',
        'SELECT COUNT(*) as total_sessions FROM user_workout_sessions WHERE completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
        'SELECT SUM(amount) as total_revenue FROM payments WHERE payment_status = "completed"',
        'SELECT COUNT(*) as active_subscriptions FROM users WHERE subscription_end_date > NOW()'
    ];
    
    const results = {};
    for (const query of queries) {
        const [result] = await executeQuery(query);
        Object.assign(results, result);
    }
    
    return results;
};

// Contact form submission
const createContactSubmission = async (contactData) => {
    const { name, email, subject, message } = contactData;
    const query = `
        INSERT INTO contact_submissions (name, email, subject, message)
        VALUES (?, ?, ?, ?)
    `;
    const result = await executeQuery(query, [name, email, subject, message]);
    return result.insertId;
};

module.exports = {
    pool,
    testConnection,
    executeQuery,
    executeTransaction,
    getUserByEmail,
    getUserById,
    createUser,
    updateUser,
    upsertUserProfile,
    getWorkouts,
    getWorkoutCategories,
    recordWorkoutSession,
    getUserWorkoutHistory,
    recordBMI,
    getUserBMIHistory,
    createPayment,
    updatePaymentStatus,
    updateUserSubscription,
    getAdminDashboardStats,
    createContactSubmission
};
