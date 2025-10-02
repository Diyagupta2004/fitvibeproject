-- FitVibe Database Schema
-- This file contains all the necessary tables for the FitVibe fitness application
-- Run this script on your Aiven MySQL database

-- Create database (if needed)
CREATE DATABASE IF NOT EXISTS fitvibe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fitvibe;

-- 1. Users table - Core user information
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
    subscription_plan ENUM('basic', 'premium', 'elite') DEFAULT NULL,
    subscription_start_date DATETIME DEFAULT NULL,
    subscription_end_date DATETIME DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255) DEFAULT NULL,
    password_reset_token VARCHAR(255) DEFAULT NULL,
    password_reset_expires DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. User profiles - Extended user information
CREATE TABLE user_profiles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    age INT DEFAULT NULL,
    gender ENUM('male', 'female', 'other') DEFAULT NULL,
    height_cm DECIMAL(5,2) DEFAULT NULL,
    weight_kg DECIMAL(5,2) DEFAULT NULL,
    fitness_level ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
    fitness_goals TEXT DEFAULT NULL,
    profile_picture VARCHAR(255) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    emergency_contact VARCHAR(255) DEFAULT NULL,
    medical_conditions TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. BMI records - Track BMI history
CREATE TABLE bmi_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    height_cm DECIMAL(5,2) NOT NULL,
    weight_kg DECIMAL(5,2) NOT NULL,
    bmi_value DECIMAL(4,2) NOT NULL,
    bmi_category ENUM('underweight', 'normal', 'overweight', 'obese') NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Workout categories
CREATE TABLE workout_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT NULL,
    image_url VARCHAR(255) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Workouts/Exercises
CREATE TABLE workouts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT NULL,
    instructions TEXT DEFAULT NULL,
    duration_minutes INT DEFAULT NULL,
    difficulty_level ENUM('beginner', 'intermediate', 'advanced') NOT NULL,
    calories_burned_estimate INT DEFAULT NULL,
    equipment_needed TEXT DEFAULT NULL,
    video_url VARCHAR(500) DEFAULT NULL,
    image_url VARCHAR(255) DEFAULT NULL,
    is_premium BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES workout_categories(id) ON DELETE CASCADE
);

-- 6. User workout sessions - Track completed workouts
CREATE TABLE user_workout_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    workout_id INT NOT NULL,
    duration_minutes INT DEFAULT NULL,
    calories_burned INT DEFAULT NULL,
    difficulty_rating INT DEFAULT NULL CHECK (difficulty_rating BETWEEN 1 AND 5),
    notes TEXT DEFAULT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);

-- 7. Workout plans - Structured fitness programs
CREATE TABLE workout_plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT NULL,
    duration_weeks INT NOT NULL,
    difficulty_level ENUM('beginner', 'intermediate', 'advanced') NOT NULL,
    goals TEXT DEFAULT NULL,
    is_premium BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 8. Workout plan exercises - Link workouts to plans
CREATE TABLE workout_plan_exercises (
    id INT PRIMARY KEY AUTO_INCREMENT,
    plan_id INT NOT NULL,
    workout_id INT NOT NULL,
    week_number INT NOT NULL,
    day_number INT NOT NULL,
    order_index INT DEFAULT 0,
    sets INT DEFAULT NULL,
    reps INT DEFAULT NULL,
    rest_seconds INT DEFAULT NULL,
    FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);

-- 9. User workout plan subscriptions
CREATE TABLE user_workout_plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    plan_id INT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP DEFAULT NULL,
    current_week INT DEFAULT 1,
    current_day INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
);

-- 10. Payments - Track subscription payments
CREATE TABLE payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    subscription_plan ENUM('basic', 'premium', 'elite') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method ENUM('card', 'paypal', 'stripe', 'razorpay') NOT NULL,
    payment_status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    transaction_id VARCHAR(255) DEFAULT NULL,
    payment_gateway_response TEXT DEFAULT NULL,
    paid_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 11. Nutrition plans (optional feature)
CREATE TABLE nutrition_plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT NULL,
    calories_per_day INT DEFAULT NULL,
    protein_grams INT DEFAULT NULL,
    carbs_grams INT DEFAULT NULL,
    fat_grams INT DEFAULT NULL,
    meal_plan_json JSON DEFAULT NULL,
    is_premium BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. User nutrition tracking
CREATE TABLE user_nutrition_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    nutrition_plan_id INT DEFAULT NULL,
    date DATE NOT NULL,
    calories_consumed INT DEFAULT NULL,
    protein_grams DECIMAL(6,2) DEFAULT NULL,
    carbs_grams DECIMAL(6,2) DEFAULT NULL,
    fat_grams DECIMAL(6,2) DEFAULT NULL,
    water_liters DECIMAL(4,2) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (nutrition_plan_id) REFERENCES nutrition_plans(id) ON DELETE SET NULL
);

-- 13. Progress photos
CREATE TABLE progress_photos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    photo_url VARCHAR(255) NOT NULL,
    weight_kg DECIMAL(5,2) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 14. User achievements/badges
CREATE TABLE achievements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT NULL,
    icon_url VARCHAR(255) DEFAULT NULL,
    criteria_json JSON DEFAULT NULL,
    points INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. User achievements earned
CREATE TABLE user_achievements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    achievement_id INT NOT NULL,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_achievement (user_id, achievement_id)
);

-- 16. App settings/configuration
CREATE TABLE app_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 17. Contact form submissions
CREATE TABLE contact_submissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(200) DEFAULT NULL,
    message TEXT NOT NULL,
    status ENUM('new', 'read', 'replied', 'closed') DEFAULT 'new',
    admin_notes TEXT DEFAULT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert initial data

-- Insert workout categories
INSERT INTO workout_categories (name, description, image_url) VALUES
('Yoga', 'Flexibility, balance, and mindfulness exercises', '/images/yoga.jpg'),
('Zumba', 'High-energy dance fitness workouts', '/images/zumba.jpg'),
('Strength Training', 'Muscle building and strength exercises', '/images/strength.jpg'),
('Cardio', 'Heart-pumping cardiovascular exercises', '/images/cardio.jpg'),
('HIIT', 'High-Intensity Interval Training', '/images/hiit.jpg'),
('Pilates', 'Core strengthening and flexibility', '/images/pilates.jpg'),
('Meditation', 'Mindfulness and relaxation practices', '/images/meditation.jpg');

-- Insert sample workouts
INSERT INTO workouts (category_id, name, description, duration_minutes, difficulty_level, calories_burned_estimate, is_premium) VALUES
(1, 'Morning Yoga Flow', 'Gentle yoga sequence to start your day', 20, 'beginner', 80, FALSE),
(1, 'Advanced Vinyasa', 'Dynamic flowing yoga practice', 45, 'advanced', 200, TRUE),
(2, 'Beginner Zumba', 'Fun dance workout for beginners', 30, 'beginner', 250, FALSE),
(2, 'High Energy Zumba', 'Intense dance cardio session', 60, 'intermediate', 500, TRUE),
(3, 'Push-up Challenge', 'Upper body strength building', 15, 'intermediate', 100, FALSE),
(3, 'Full Body Strength', 'Complete strength training workout', 45, 'advanced', 300, TRUE),
(4, '10-Minute Cardio Blast', 'Quick cardio session', 10, 'beginner', 120, FALSE),
(5, 'HIIT Beginner', 'Introduction to high-intensity training', 20, 'beginner', 200, FALSE),
(6, 'Core Pilates', 'Strengthen your core muscles', 25, 'intermediate', 150, TRUE);

-- Insert sample workout plans
INSERT INTO workout_plans (name, description, duration_weeks, difficulty_level, goals, is_premium) VALUES
('Beginner Fitness Journey', 'Perfect for those starting their fitness journey', 4, 'beginner', 'Build basic fitness, establish routine', FALSE),
('Weight Loss Challenge', 'Comprehensive plan for weight loss', 8, 'intermediate', 'Lose weight, improve cardiovascular health', TRUE),
('Strength Building Program', 'Focus on building muscle and strength', 12, 'advanced', 'Increase muscle mass, improve strength', TRUE);

-- Insert app settings
INSERT INTO app_settings (setting_key, setting_value, description) VALUES
('app_name', 'FitVibe', 'Application name'),
('basic_plan_price', '999', 'Basic plan price in INR'),
('premium_plan_price', '1999', 'Premium plan price in INR'),
('elite_plan_price', '2999', 'Elite plan price in INR'),
('support_email', 'support@fitvibe.com', 'Support email address'),
('max_file_upload_size', '10485760', 'Maximum file upload size in bytes (10MB)');

-- Insert sample achievements
INSERT INTO achievements (name, description, points) VALUES
('First Workout', 'Complete your first workout session', 10),
('Week Warrior', 'Complete 7 workouts in a week', 50),
('Month Master', 'Complete 30 workouts in a month', 200),
('BMI Tracker', 'Record your first BMI measurement', 15),
('Consistency King', 'Workout for 30 consecutive days', 300);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_subscription ON users(subscription_plan, subscription_end_date);
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_bmi_records_user_date ON bmi_records(user_id, recorded_at);
CREATE INDEX idx_workout_sessions_user_date ON user_workout_sessions(user_id, completed_at);
CREATE INDEX idx_payments_user_status ON payments(user_id, payment_status);
CREATE INDEX idx_workouts_category_difficulty ON workouts(category_id, difficulty_level);
CREATE INDEX idx_workouts_premium ON workouts(is_premium, is_active);

-- Create views for common queries

-- View for user dashboard data
CREATE VIEW user_dashboard_view AS
SELECT 
    u.id,
    u.name,
    u.email,
    u.subscription_plan,
    u.subscription_end_date,
    up.age,
    up.fitness_level,
    COUNT(DISTINCT uws.id) as total_workouts,
    COUNT(DISTINCT DATE(uws.completed_at)) as workout_days,
    AVG(br.bmi_value) as avg_bmi,
    MAX(br.recorded_at) as last_bmi_date
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN user_workout_sessions uws ON u.id = uws.user_id
LEFT JOIN bmi_records br ON u.id = br.user_id
WHERE u.is_active = TRUE
GROUP BY u.id;

-- View for workout statistics
CREATE VIEW workout_stats_view AS
SELECT 
    w.id,
    w.name,
    w.category_id,
    wc.name as category_name,
    w.difficulty_level,
    w.is_premium,
    COUNT(uws.id) as total_sessions,
    AVG(uws.duration_minutes) as avg_duration,
    AVG(uws.calories_burned) as avg_calories,
    AVG(uws.difficulty_rating) as avg_rating
FROM workouts w
LEFT JOIN workout_categories wc ON w.category_id = wc.id
LEFT JOIN user_workout_sessions uws ON w.id = uws.workout_id
WHERE w.is_active = TRUE
GROUP BY w.id;

-- Stored procedures for common operations

DELIMITER //

-- Procedure to calculate and insert BMI record
CREATE PROCEDURE CalculateAndInsertBMI(
    IN p_user_id INT,
    IN p_height_cm DECIMAL(5,2),
    IN p_weight_kg DECIMAL(5,2)
)
BEGIN
    DECLARE v_bmi DECIMAL(4,2);
    DECLARE v_category VARCHAR(20);
    
    -- Calculate BMI
    SET v_bmi = p_weight_kg / POWER(p_height_cm / 100, 2);
    
    -- Determine category
    IF v_bmi < 18.5 THEN
        SET v_category = 'underweight';
    ELSEIF v_bmi < 25 THEN
        SET v_category = 'normal';
    ELSEIF v_bmi < 30 THEN
        SET v_category = 'overweight';
    ELSE
        SET v_category = 'obese';
    END IF;
    
    -- Insert record
    INSERT INTO bmi_records (user_id, height_cm, weight_kg, bmi_value, bmi_category)
    VALUES (p_user_id, p_height_cm, p_weight_kg, v_bmi, v_category);
    
    -- Update user profile
    UPDATE user_profiles 
    SET height_cm = p_height_cm, weight_kg = p_weight_kg, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
END //

-- Procedure to check and award achievements
CREATE PROCEDURE CheckAndAwardAchievements(IN p_user_id INT)
BEGIN
    -- First workout achievement
    IF NOT EXISTS (SELECT 1 FROM user_achievements WHERE user_id = p_user_id AND achievement_id = 1) THEN
        IF EXISTS (SELECT 1 FROM user_workout_sessions WHERE user_id = p_user_id LIMIT 1) THEN
            INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, 1);
        END IF;
    END IF;
    
    -- BMI tracker achievement
    IF NOT EXISTS (SELECT 1 FROM user_achievements WHERE user_id = p_user_id AND achievement_id = 4) THEN
        IF EXISTS (SELECT 1 FROM bmi_records WHERE user_id = p_user_id LIMIT 1) THEN
            INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, 4);
        END IF;
    END IF;
END //

DELIMITER ;

-- Create triggers

-- Trigger to update user profile timestamp
DELIMITER //
CREATE TRIGGER update_user_profile_timestamp
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END //
DELIMITER ;

-- Trigger to check achievements after workout session
DELIMITER //
CREATE TRIGGER check_achievements_after_workout
    AFTER INSERT ON user_workout_sessions
    FOR EACH ROW
BEGIN
    CALL CheckAndAwardAchievements(NEW.user_id);
END //
DELIMITER ;

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON fitvibe.* TO 'fitvibe_user'@'%' IDENTIFIED BY 'your_secure_password';
-- FLUSH PRIVILEGES;

-- End of schema
