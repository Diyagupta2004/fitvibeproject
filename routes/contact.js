const express = require('express');
const nodemailer = require('nodemailer');
const { createContactSubmission } = require('../config/database');
const { validateContact } = require('../middleware/validation');

const router = express.Router();

// Email transporter setup
const createEmailTransporter = () => {
    return nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
};

// @route   POST /api/contact/submit
// @desc    Submit contact form
// @access  Public
router.post('/submit', validateContact, async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Create contact submission in database
        const submissionId = await createContactSubmission({
            name,
            email,
            subject: subject || 'General Inquiry',
            message
        });

        // Send notification email to admin (if configured)
        if (process.env.EMAIL_USER && process.env.ADMIN_EMAIL) {
            try {
                const transporter = createEmailTransporter();
                
                await transporter.sendMail({
                    from: process.env.EMAIL_FROM,
                    to: process.env.ADMIN_EMAIL,
                    subject: `New Contact Form Submission - ${subject || 'General Inquiry'}`,
                    html: `
                        <h2>New Contact Form Submission</h2>
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
                        <p><strong>Message:</strong></p>
                        <p>${message.replace(/\n/g, '<br>')}</p>
                        <hr>
                        <p><small>Submission ID: ${submissionId}</small></p>
                    `
                });
            } catch (emailError) {
                console.error('Failed to send admin notification email:', emailError);
                // Continue with success response even if email fails
            }
        }

        // Send auto-reply to user (if configured)
        if (process.env.EMAIL_USER) {
            try {
                const transporter = createEmailTransporter();
                
                await transporter.sendMail({
                    from: process.env.EMAIL_FROM,
                    to: email,
                    subject: 'Thank you for contacting FitVibe',
                    html: `
                        <h2>Thank you for reaching out!</h2>
                        <p>Hi ${name},</p>
                        <p>We've received your message and will get back to you within 24-48 hours.</p>
                        <p><strong>Your message:</strong></p>
                        <p>${message.replace(/\n/g, '<br>')}</p>
                        <hr>
                        <p>Best regards,<br>The FitVibe Team</p>
                        <p><small>Reference ID: ${submissionId}</small></p>
                    `
                });
            } catch (emailError) {
                console.error('Failed to send auto-reply email:', emailError);
                // Continue with success response even if email fails
            }
        }

        res.status(201).json({
            success: true,
            message: 'Thank you for your message! We will get back to you soon.',
            data: {
                submission_id: submissionId,
                reference_id: `FV-${submissionId.toString().padStart(6, '0')}`
            }
        });

    } catch (error) {
        console.error('Contact form submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit contact form. Please try again.'
        });
    }
});

// @route   GET /api/contact/info
// @desc    Get contact information
// @access  Public
router.get('/info', (req, res) => {
    const contactInfo = {
        email: process.env.SUPPORT_EMAIL || 'support@fitvibe.com',
        phone: '+91-9876543210', // Add your phone number
        address: {
            line1: 'FitVibe Fitness Center',
            line2: '123 Fitness Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            country: 'India',
            postal_code: '400001'
        },
        business_hours: {
            monday_friday: '6:00 AM - 10:00 PM',
            saturday: '7:00 AM - 9:00 PM',
            sunday: '8:00 AM - 8:00 PM'
        },
        social_media: {
            facebook: 'https://facebook.com/fitvibe',
            instagram: 'https://instagram.com/fitvibe',
            twitter: 'https://twitter.com/fitvibe',
            youtube: 'https://youtube.com/fitvibe'
        },
        emergency_contact: '+91-9876543211'
    };

    res.json({
        success: true,
        data: contactInfo
    });
});

// @route   GET /api/contact/faq
// @desc    Get frequently asked questions
// @access  Public
router.get('/faq', (req, res) => {
    const faqData = [
        {
            id: 1,
            category: 'Membership',
            question: 'What subscription plans do you offer?',
            answer: 'We offer three plans: Basic (₹999/month), Premium (₹1999/month), and Elite (₹2999/month). Each plan includes different features and access levels.'
        },
        {
            id: 2,
            category: 'Membership',
            question: 'Can I cancel my subscription anytime?',
            answer: 'Yes, you can cancel your subscription at any time from your account dashboard. The cancellation will take effect at the end of your current billing period.'
        },
        {
            id: 3,
            category: 'Workouts',
            question: 'Do I need equipment for the workouts?',
            answer: 'Many of our workouts can be done with just body weight. For workouts that require equipment, we provide a list of needed items in the workout description.'
        },
        {
            id: 4,
            category: 'Workouts',
            question: 'Are the workouts suitable for beginners?',
            answer: 'Absolutely! We have workouts for all fitness levels - beginner, intermediate, and advanced. Each workout is clearly labeled with its difficulty level.'
        },
        {
            id: 5,
            category: 'Technical',
            question: 'How do I track my progress?',
            answer: 'You can track your progress through your dashboard, which shows workout history, BMI records, calories burned, and achievement badges.'
        },
        {
            id: 6,
            category: 'Technical',
            question: 'Can I use the app offline?',
            answer: 'Some features work offline, but you\'ll need an internet connection for video streaming and progress syncing.'
        },
        {
            id: 7,
            category: 'Payment',
            question: 'What payment methods do you accept?',
            answer: 'We accept all major credit/debit cards, UPI, net banking, and digital wallets through our secure payment partners Stripe and Razorpay.'
        },
        {
            id: 8,
            category: 'Payment',
            question: 'Is my payment information secure?',
            answer: 'Yes, we use industry-standard encryption and work with certified payment processors. We never store your payment information on our servers.'
        },
        {
            id: 9,
            category: 'Account',
            question: 'How do I reset my password?',
            answer: 'Click on "Forgot Password" on the login page and enter your email. You\'ll receive a password reset link within a few minutes.'
        },
        {
            id: 10,
            category: 'Account',
            question: 'Can I change my email address?',
            answer: 'Yes, you can update your email address from your profile settings. You\'ll need to verify the new email address.'
        }
    ];

    // Group FAQs by category
    const groupedFAQs = faqData.reduce((acc, faq) => {
        if (!acc[faq.category]) {
            acc[faq.category] = [];
        }
        acc[faq.category].push(faq);
        return acc;
    }, {});

    res.json({
        success: true,
        data: {
            faqs: faqData,
            grouped_faqs: groupedFAQs,
            categories: [...new Set(faqData.map(faq => faq.category))]
        }
    });
});

// @route   GET /api/contact/support-topics
// @desc    Get support topics for contact form
// @access  Public
router.get('/support-topics', (req, res) => {
    const supportTopics = [
        {
            id: 'technical',
            name: 'Technical Support',
            description: 'App issues, login problems, bugs'
        },
        {
            id: 'billing',
            name: 'Billing & Payments',
            description: 'Subscription issues, payment problems, refunds'
        },
        {
            id: 'account',
            name: 'Account Management',
            description: 'Profile updates, password reset, account deletion'
        },
        {
            id: 'workouts',
            name: 'Workouts & Content',
            description: 'Workout questions, content suggestions, difficulty levels'
        },
        {
            id: 'general',
            name: 'General Inquiry',
            description: 'General questions, feedback, suggestions'
        },
        {
            id: 'partnership',
            name: 'Business & Partnerships',
            description: 'Business inquiries, partnerships, collaborations'
        }
    ];

    res.json({
        success: true,
        data: supportTopics
    });
});

module.exports = router;
