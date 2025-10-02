const bcrypt = require('bcryptjs');
const { 
    testConnection, 
    createUser, 
    upsertUserProfile,
    executeQuery 
} = require('../config/database');

// Sample data for seeding
const seedData = {
    users: [
        {
            name: 'Admin User',
            email: 'admin@fitvibe.com',
            password: 'AdminPassword123!',
            role: 'admin'
        },
        {
            name: 'John Doe',
            email: 'john@example.com',
            password: 'UserPassword123!',
            role: 'user'
        },
        {
            name: 'Jane Smith',
            email: 'jane@example.com',
            password: 'UserPassword123!',
            role: 'user'
        }
    ],
    
    workoutCategories: [
        { name: 'Yoga', description: 'Flexibility, balance, and mindfulness exercises' },
        { name: 'Zumba', description: 'High-energy dance fitness workouts' },
        { name: 'Strength Training', description: 'Muscle building and strength exercises' },
        { name: 'Cardio', description: 'Heart-pumping cardiovascular exercises' },
        { name: 'HIIT', description: 'High-Intensity Interval Training' },
        { name: 'Pilates', description: 'Core strengthening and flexibility' }
    ],

    workouts: [
        {
            category_id: 1,
            name: 'Morning Yoga Flow',
            description: 'Gentle yoga sequence to start your day with energy and mindfulness',
            instructions: 'Follow along with the instructor, focusing on breath and movement',
            duration_minutes: 20,
            difficulty_level: 'beginner',
            calories_burned_estimate: 80,
            equipment_needed: 'Yoga mat',
            video_url: 'https://www.youtube.com/embed/v7AYKMP6rOE',
            is_premium: false
        },
        {
            category_id: 1,
            name: 'Advanced Vinyasa Flow',
            description: 'Dynamic flowing yoga practice for experienced practitioners',
            instructions: 'Advanced poses requiring flexibility and strength',
            duration_minutes: 45,
            difficulty_level: 'advanced',
            calories_burned_estimate: 200,
            equipment_needed: 'Yoga mat, blocks (optional)',
            video_url: 'https://www.youtube.com/embed/v7AYKMP6rOE',
            is_premium: true
        },
        {
            category_id: 2,
            name: 'Beginner Zumba Party',
            description: 'Fun dance workout perfect for beginners',
            instructions: 'Follow the dance moves and have fun!',
            duration_minutes: 30,
            difficulty_level: 'beginner',
            calories_burned_estimate: 250,
            equipment_needed: 'None',
            video_url: 'https://www.youtube.com/embed/mZeFvX3ALKY',
            is_premium: false
        },
        {
            category_id: 3,
            name: 'Full Body Strength Circuit',
            description: 'Complete strength training workout targeting all muscle groups',
            instructions: 'Use proper form and rest between sets',
            duration_minutes: 45,
            difficulty_level: 'intermediate',
            calories_burned_estimate: 300,
            equipment_needed: 'Dumbbells, resistance bands',
            is_premium: true
        },
        {
            category_id: 4,
            name: '10-Minute Cardio Blast',
            description: 'Quick high-intensity cardio session',
            instructions: 'Push yourself but listen to your body',
            duration_minutes: 10,
            difficulty_level: 'beginner',
            calories_burned_estimate: 120,
            equipment_needed: 'None',
            is_premium: false
        }
    ],

    workoutPlans: [
        {
            name: 'Beginner Fitness Journey',
            description: 'Perfect 4-week program for those starting their fitness journey',
            duration_weeks: 4,
            difficulty_level: 'beginner',
            goals: 'Build basic fitness foundation, establish routine, improve overall health',
            is_premium: false
        },
        {
            name: 'Weight Loss Challenge',
            description: 'Comprehensive 8-week program designed for effective weight loss',
            duration_weeks: 8,
            difficulty_level: 'intermediate',
            goals: 'Lose weight, improve cardiovascular health, build lean muscle',
            is_premium: true
        }
    ],

    achievements: [
        {
            name: 'First Steps',
            description: 'Complete your first workout session',
            icon_url: '/icons/first-workout.png',
            points: 10
        },
        {
            name: 'Week Warrior',
            description: 'Complete 7 workouts in a week',
            icon_url: '/icons/week-warrior.png',
            points: 50
        },
        {
            name: 'BMI Tracker',
            description: 'Record your first BMI measurement',
            icon_url: '/icons/bmi-tracker.png',
            points: 15
        },
        {
            name: 'Consistency Champion',
            description: 'Workout for 30 consecutive days',
            icon_url: '/icons/consistency.png',
            points: 300
        }
    ]
};

async function seedDatabase() {
    try {
        console.log('🌱 Starting database seeding...');

        // Test database connection
        const isConnected = await testConnection();
        if (!isConnected) {
            throw new Error('Database connection failed');
        }

        // Seed users
        console.log('👥 Seeding users...');
        for (const userData of seedData.users) {
            try {
                // Check if user already exists
                const existingUser = await executeQuery(
                    'SELECT id FROM users WHERE email = ?',
                    [userData.email]
                );

                if (existingUser.length === 0) {
                    // Hash password
                    const saltRounds = 12;
                    const password_hash = await bcrypt.hash(userData.password, saltRounds);

                    // Create user
                    const userId = await createUser({
                        name: userData.name,
                        email: userData.email,
                        password_hash,
                        role: userData.role
                    });

                    // Create user profile
                    await upsertUserProfile(userId, {
                        fitness_level: 'beginner'
                    });

                    console.log(`✅ Created user: ${userData.email}`);
                } else {
                    console.log(`⏭️  User already exists: ${userData.email}`);
                }
            } catch (error) {
                console.error(`❌ Failed to create user ${userData.email}:`, error.message);
            }
        }

        // Seed workout categories (if not already exist)
        console.log('🏃 Seeding workout categories...');
        for (const category of seedData.workoutCategories) {
            try {
                const existing = await executeQuery(
                    'SELECT id FROM workout_categories WHERE name = ?',
                    [category.name]
                );

                if (existing.length === 0) {
                    await executeQuery(
                        'INSERT INTO workout_categories (name, description) VALUES (?, ?)',
                        [category.name, category.description]
                    );
                    console.log(`✅ Created category: ${category.name}`);
                } else {
                    console.log(`⏭️  Category already exists: ${category.name}`);
                }
            } catch (error) {
                console.error(`❌ Failed to create category ${category.name}:`, error.message);
            }
        }

        // Seed workouts
        console.log('💪 Seeding workouts...');
        for (const workout of seedData.workouts) {
            try {
                const existing = await executeQuery(
                    'SELECT id FROM workouts WHERE name = ?',
                    [workout.name]
                );

                if (existing.length === 0) {
                    const insertQuery = `
                        INSERT INTO workouts (
                            category_id, name, description, instructions, duration_minutes,
                            difficulty_level, calories_burned_estimate, equipment_needed,
                            video_url, is_premium
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    await executeQuery(insertQuery, [
                        workout.category_id,
                        workout.name,
                        workout.description,
                        workout.instructions,
                        workout.duration_minutes,
                        workout.difficulty_level,
                        workout.calories_burned_estimate,
                        workout.equipment_needed,
                        workout.video_url,
                        workout.is_premium
                    ]);

                    console.log(`✅ Created workout: ${workout.name}`);
                } else {
                    console.log(`⏭️  Workout already exists: ${workout.name}`);
                }
            } catch (error) {
                console.error(`❌ Failed to create workout ${workout.name}:`, error.message);
            }
        }

        // Seed workout plans
        console.log('📋 Seeding workout plans...');
        for (const plan of seedData.workoutPlans) {
            try {
                const existing = await executeQuery(
                    'SELECT id FROM workout_plans WHERE name = ?',
                    [plan.name]
                );

                if (existing.length === 0) {
                    const insertQuery = `
                        INSERT INTO workout_plans (
                            name, description, duration_weeks, difficulty_level, goals, is_premium
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    `;

                    await executeQuery(insertQuery, [
                        plan.name,
                        plan.description,
                        plan.duration_weeks,
                        plan.difficulty_level,
                        plan.goals,
                        plan.is_premium
                    ]);

                    console.log(`✅ Created workout plan: ${plan.name}`);
                } else {
                    console.log(`⏭️  Workout plan already exists: ${plan.name}`);
                }
            } catch (error) {
                console.error(`❌ Failed to create workout plan ${plan.name}:`, error.message);
            }
        }

        // Seed achievements
        console.log('🏆 Seeding achievements...');
        for (const achievement of seedData.achievements) {
            try {
                const existing = await executeQuery(
                    'SELECT id FROM achievements WHERE name = ?',
                    [achievement.name]
                );

                if (existing.length === 0) {
                    await executeQuery(
                        'INSERT INTO achievements (name, description, icon_url, points) VALUES (?, ?, ?, ?)',
                        [achievement.name, achievement.description, achievement.icon_url, achievement.points]
                    );
                    console.log(`✅ Created achievement: ${achievement.name}`);
                } else {
                    console.log(`⏭️  Achievement already exists: ${achievement.name}`);
                }
            } catch (error) {
                console.error(`❌ Failed to create achievement ${achievement.name}:`, error.message);
            }
        }

        // Seed app settings
        console.log('⚙️  Seeding app settings...');
        const appSettings = [
            { key: 'app_name', value: 'FitVibe', description: 'Application name' },
            { key: 'basic_plan_price', value: '999', description: 'Basic plan price in INR' },
            { key: 'premium_plan_price', value: '1999', description: 'Premium plan price in INR' },
            { key: 'elite_plan_price', value: '2999', description: 'Elite plan price in INR' },
            { key: 'support_email', value: 'support@fitvibe.com', description: 'Support email address' }
        ];

        for (const setting of appSettings) {
            try {
                const existing = await executeQuery(
                    'SELECT id FROM app_settings WHERE setting_key = ?',
                    [setting.key]
                );

                if (existing.length === 0) {
                    await executeQuery(
                        'INSERT INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
                        [setting.key, setting.value, setting.description]
                    );
                    console.log(`✅ Created setting: ${setting.key}`);
                } else {
                    console.log(`⏭️  Setting already exists: ${setting.key}`);
                }
            } catch (error) {
                console.error(`❌ Failed to create setting ${setting.key}:`, error.message);
            }
        }

        console.log('🎉 Database seeding completed successfully!');
        console.log('\n📋 Summary:');
        console.log('- Admin user: admin@fitvibe.com (password: AdminPassword123!)');
        console.log('- Test users: john@example.com, jane@example.com (password: UserPassword123!)');
        console.log('- Workout categories, workouts, plans, and achievements have been created');
        console.log('- App settings have been configured');
        console.log('\n🚀 You can now start the server and test the API!');

    } catch (error) {
        console.error('❌ Database seeding failed:', error);
        process.exit(1);
    }
}

// Run seeding if this file is executed directly
if (require.main === module) {
    seedDatabase().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Seeding failed:', error);
        process.exit(1);
    });
}

module.exports = { seedDatabase };
