const express = require('express');
const { 
    recordBMI, 
    getUserBMIHistory,
    executeQuery 
} = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateBMI } = require('../middleware/validation');

const router = express.Router();

// @route   POST /api/bmi/calculate
// @desc    Calculate and record BMI
// @access  Private
router.post('/calculate', authenticateToken, validateBMI, async (req, res) => {
    try {
        const { height_cm, weight_kg } = req.body;
        const userId = req.user.id;

        // Calculate BMI using stored procedure
        await recordBMI(userId, height_cm, weight_kg);

        // Get the latest BMI record
        const latestBMI = await executeQuery(`
            SELECT * FROM bmi_records 
            WHERE user_id = ? 
            ORDER BY recorded_at DESC 
            LIMIT 1
        `, [userId]);

        if (latestBMI.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'Failed to record BMI'
            });
        }

        const bmiRecord = latestBMI[0];

        // Get BMI advice based on category
        const getBMIAdvice = (category) => {
            switch (category) {
                case 'underweight':
                    return {
                        advice: 'Consider consulting a healthcare provider for healthy weight gain advice.',
                        recommendations: [
                            'Eat nutrient-dense, calorie-rich foods',
                            'Include healthy fats in your diet',
                            'Consider strength training to build muscle mass',
                            'Consult with a nutritionist'
                        ]
                    };
                case 'normal':
                    return {
                        advice: 'Great! Maintain your healthy lifestyle with balanced nutrition and exercise.',
                        recommendations: [
                            'Continue regular physical activity',
                            'Maintain a balanced diet',
                            'Stay hydrated',
                            'Get adequate sleep'
                        ]
                    };
                case 'overweight':
                    return {
                        advice: 'Consider healthier eating habits and increased physical activity.',
                        recommendations: [
                            'Focus on portion control',
                            'Increase cardiovascular exercise',
                            'Choose whole foods over processed foods',
                            'Consider consulting a fitness trainer'
                        ]
                    };
                case 'obese':
                    return {
                        advice: 'Consult a healthcare provider for a personalized weight management plan.',
                        recommendations: [
                            'Seek professional medical guidance',
                            'Start with low-impact exercises',
                            'Focus on gradual, sustainable changes',
                            'Consider working with a registered dietitian'
                        ]
                    };
                default:
                    return {
                        advice: 'Continue monitoring your health and fitness progress.',
                        recommendations: ['Maintain regular health check-ups']
                    };
            }
        };

        const bmiGuidance = getBMIAdvice(bmiRecord.bmi_category);

        res.status(201).json({
            success: true,
            message: 'BMI calculated and recorded successfully',
            data: {
                ...bmiRecord,
                ...bmiGuidance
            }
        });

    } catch (error) {
        console.error('Calculate BMI error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate BMI'
        });
    }
});

// @route   GET /api/bmi/history
// @desc    Get user BMI history
// @access  Private
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const bmiHistory = await getUserBMIHistory(req.user.id, limit);

        // Calculate trends if there are multiple records
        let trends = null;
        if (bmiHistory.length >= 2) {
            const latest = bmiHistory[0];
            const previous = bmiHistory[1];
            
            const bmiChange = latest.bmi_value - previous.bmi_value;
            const weightChange = latest.weight_kg - previous.weight_kg;
            
            trends = {
                bmi_change: parseFloat(bmiChange.toFixed(2)),
                weight_change: parseFloat(weightChange.toFixed(2)),
                trend_direction: bmiChange > 0 ? 'increasing' : bmiChange < 0 ? 'decreasing' : 'stable',
                days_between: Math.ceil((new Date(latest.recorded_at) - new Date(previous.recorded_at)) / (1000 * 60 * 60 * 24))
            };
        }

        res.json({
            success: true,
            data: {
                history: bmiHistory,
                trends: trends,
                total_records: bmiHistory.length
            }
        });

    } catch (error) {
        console.error('Get BMI history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get BMI history'
        });
    }
});

// @route   GET /api/bmi/latest
// @desc    Get latest BMI record
// @access  Private
router.get('/latest', authenticateToken, async (req, res) => {
    try {
        const latestBMI = await executeQuery(`
            SELECT * FROM bmi_records 
            WHERE user_id = ? 
            ORDER BY recorded_at DESC 
            LIMIT 1
        `, [req.user.id]);

        if (latestBMI.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: 'No BMI records found'
            });
        }

        res.json({
            success: true,
            data: latestBMI[0]
        });

    } catch (error) {
        console.error('Get latest BMI error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get latest BMI'
        });
    }
});

// @route   GET /api/bmi/statistics
// @desc    Get BMI statistics and analytics
// @access  Private
router.get('/statistics', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get comprehensive BMI statistics
        const statsQueries = [
            // Average BMI
            `SELECT AVG(bmi_value) as avg_bmi FROM bmi_records WHERE user_id = ?`,
            
            // Min/Max BMI
            `SELECT MIN(bmi_value) as min_bmi, MAX(bmi_value) as max_bmi FROM bmi_records WHERE user_id = ?`,
            
            // BMI category distribution
            `SELECT bmi_category, COUNT(*) as count FROM bmi_records WHERE user_id = ? GROUP BY bmi_category`,
            
            // Recent trend (last 6 months)
            `SELECT 
                DATE_FORMAT(recorded_at, '%Y-%m') as month,
                AVG(bmi_value) as avg_bmi,
                AVG(weight_kg) as avg_weight
             FROM bmi_records 
             WHERE user_id = ? AND recorded_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
             GROUP BY DATE_FORMAT(recorded_at, '%Y-%m')
             ORDER BY month`,
            
            // Total records count
            `SELECT COUNT(*) as total_records FROM bmi_records WHERE user_id = ?`
        ];

        const [
            avgResult,
            minMaxResult,
            categoryResult,
            trendResult,
            countResult
        ] = await Promise.all(
            statsQueries.map(query => executeQuery(query, [userId]))
        );

        const statistics = {
            average_bmi: avgResult[0]?.avg_bmi ? parseFloat(avgResult[0].avg_bmi.toFixed(2)) : null,
            min_bmi: minMaxResult[0]?.min_bmi ? parseFloat(minMaxResult[0].min_bmi.toFixed(2)) : null,
            max_bmi: minMaxResult[0]?.max_bmi ? parseFloat(minMaxResult[0].max_bmi.toFixed(2)) : null,
            category_distribution: categoryResult,
            monthly_trends: trendResult.map(row => ({
                month: row.month,
                avg_bmi: parseFloat(row.avg_bmi.toFixed(2)),
                avg_weight: parseFloat(row.avg_weight.toFixed(2))
            })),
            total_records: countResult[0]?.total_records || 0
        };

        res.json({
            success: true,
            data: statistics
        });

    } catch (error) {
        console.error('Get BMI statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get BMI statistics'
        });
    }
});

// @route   DELETE /api/bmi/:id
// @desc    Delete BMI record
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const bmiId = req.params.id;
        const userId = req.user.id;

        // Check if BMI record exists and belongs to user
        const bmiRecord = await executeQuery(
            'SELECT * FROM bmi_records WHERE id = ? AND user_id = ?',
            [bmiId, userId]
        );

        if (bmiRecord.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'BMI record not found'
            });
        }

        // Delete the record
        await executeQuery('DELETE FROM bmi_records WHERE id = ?', [bmiId]);

        res.json({
            success: true,
            message: 'BMI record deleted successfully'
        });

    } catch (error) {
        console.error('Delete BMI record error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete BMI record'
        });
    }
});

// @route   GET /api/bmi/ranges
// @desc    Get BMI category ranges and information
// @access  Public
router.get('/ranges', (req, res) => {
    const bmiRanges = {
        underweight: {
            range: '< 18.5',
            description: 'Below normal weight',
            color: '#87ceeb',
            health_risks: ['Malnutrition', 'Osteoporosis', 'Decreased immune function'],
            recommendations: ['Increase caloric intake', 'Strength training', 'Consult healthcare provider']
        },
        normal: {
            range: '18.5 - 24.9',
            description: 'Normal weight',
            color: '#90ee90',
            health_risks: ['Lowest risk'],
            recommendations: ['Maintain current lifestyle', 'Regular exercise', 'Balanced diet']
        },
        overweight: {
            range: '25.0 - 29.9',
            description: 'Above normal weight',
            color: '#ffd700',
            health_risks: ['Increased risk of heart disease', 'Type 2 diabetes', 'High blood pressure'],
            recommendations: ['Increase physical activity', 'Reduce caloric intake', 'Focus on whole foods']
        },
        obese: {
            range: '≥ 30.0',
            description: 'Obesity',
            color: '#ff6b6b',
            health_risks: ['High risk of chronic diseases', 'Sleep apnea', 'Stroke'],
            recommendations: ['Seek medical guidance', 'Structured weight loss program', 'Professional support']
        }
    };

    res.json({
        success: true,
        data: {
            ranges: bmiRanges,
            formula: 'BMI = weight (kg) / height (m)²',
            note: 'BMI is a screening tool and may not be accurate for all individuals. Consult healthcare providers for personalized advice.'
        }
    });
});

module.exports = router;
