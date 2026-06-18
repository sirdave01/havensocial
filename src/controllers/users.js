
import bcrypt from 'bcrypt';

import { body, validationResult } from 'express-validator';

import { 
    createUser, 
    authenticateUser, 
    getAllUsers 
} from '../models/users.js';

// Validation middleware
const userValidation = [

    body('username')
        .trim()
        .notEmpty().withMessage('Username is required')
        .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),

    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),

    body('password')
        .trim()
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

    body('confirm_password')
        .trim()
        .custom((value, { req }) => {
            if (value !== req.body.password) throw new Error('Passwords do not match');
            return true;
        }),

    body('fullName').trim().optional().isLength({ max: 100 }),

    body('displayName').trim().optional().isLength({ max: 100 })

];

// ====================== REGISTRATION ======================
const showUserRegistrationForm = (req, res) => {

    res.render('register', { 
        title: 'Register',
        isLoggedIn: !!req.session.user,
        user: req.session.user || null

    });

};

// ====================== REGISTRATION ======================
const processUserRegistrationForm = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        errors.array().forEach(err => req.flash('error', err.msg));
        return res.redirect('/register');
    }

    const { username, email, password, fullName, displayName } = req.body;

    try {
        const salt = await bcrypt.genSalt(14);
        const passwordHash = await bcrypt.hash(password, salt);
        
        const newUser = await createUser(username, email, passwordHash, fullName, displayName);
        
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');

    } catch (error) {
        console.error('Registration error:', error.message || error);
        if (error.message?.includes('duplicate') || error.message === 'Email already in use') {
            req.flash('error', 'Email already in use. Please try another.');
        } else {
            req.flash('error', 'Registration failed. Please try again.');
        }
        res.redirect('/register');

    }

};

// ====================== LOGIN ======================
const showLoginForm = (req, res) => {

    res.render('login', { 
        title: 'Login',
        isLoggedIn: !!req.session.user,
        user: req.session.user || null
    });
};

// ====================== LOGIN ======================
const processLoginForm = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await authenticateUser(email, password);
        
        if (user) {
            req.session.user = user;
            req.session.save((err) => {
                if (err) console.error('Session save error:', err);
                
                req.flash('success', 'Login successful!');
                return res.redirect(`/profile/${user.username}`);
            });
        } else {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }
    } catch (error) {
        console.error('Login error:', error.message || error);
        req.flash('error', 'Login failed. Please try again.');
        res.redirect('/login');
    }
};

// ====================== OTHER CONTROLLERS ======================
const processLogout = (req, res) => {
    // Set flash message BEFORE destroying the session
    if (req.session) {
        req.flash('success', 'You have been logged out.');
    }

    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
        }

        res.clearCookie('connect.sid'); // Clear session cookie
        res.redirect('/login');
    });
};

const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        req.flash('error', 'You must be logged in to access this page.');
        return res.redirect('/login');
    }
    next();
};

const requireRole = (role) => {
    return (req, res, next) => {
        if (req.session.user && req.session.user.role_name === role) {
            return next();
        }
        req.flash('error', 'You do not have permission to access this page.');
        res.redirect('/');
    };
};

// General Dashboard
const showDashboard = (req, res) => {
    res.render('dashboard', { 
        title: 'Dashboard', 
        user: req.session.user,
        isLoggedIn: true   // since requireLogin is usually used here
    });
};

// Founder Users Management
const showUsers = async (req, res) => {
    if (!req.session.user || req.session.user.role_name !== 'founder') {
        req.flash('error', 'Access denied.');
        return res.redirect(`/profile/${req.session.user?.username || ''}`);
    }

    try {
        const users = await getAllUsers();
        res.render('users', { 
            title: 'All Users', 
            users,
            user: req.session.user,
            isLoggedIn: true
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        req.flash('error', 'Failed to load users.');
        res.redirect('/');
    }
};

// ==================== USER MANAGEMENT (Founder Only) ====================

const adminSuspendUser = async (req, res) => {

    if (req.session.user?.role_name !== 'founder') {

        req.flash('error', 'Access denied.');

        return res.redirect('/users');

    }

    const { userId } = req.params;

    const { action } = req.body; 

    const isSuspend = action === 'suspend';

    try {

        await toggleSuspendUser(userId, isSuspend);
        
        // Audit Log
        await logAuditAction(

            req.session.user.user_id,

            isSuspend ? 'suspend_user' : 'unsuspend_user',

            userId,

            'user',

            { reason: 'Founder action via dashboard' }

        );

        req.flash('success', `User has been ${isSuspend ? 'suspended' : 'unsuspended'}.`);

    } catch (error) {

        console.error('Suspend error:', error);

        req.flash('error', 'Failed to update user status.');

    }

    res.redirect('/users');

};

const adminVerifyUser = async (req, res) => {

    if (req.session.user?.role_name !== 'founder') {

        req.flash('error', 'Access denied.');

        return res.redirect('/users');

    }

    const { userId } = req.params;
    const { action } = req.body;
    const isVerify = action === 'verify';

    try {
        await toggleVerifyUser(userId, isVerify);
        
        // Audit Log
        await logAuditAction(

            req.session.user.users_id,

            isVerify ? 'verify_user' : 'unverify_user',
            userId,
            'user',

            { reason: 'Founder manual verification' }

        );

        req.flash('success', `User has been ${isVerify ? 'verified' : 'unverified'}.`);

    } catch (error) {

        console.error('Verify error:', error);

        req.flash('error', 'Failed to update verification status.');

    }

    res.redirect('/users');
};

const adminDeleteUser = async (req, res) => {

    if (req.session.user?.role_name !== 'founder') {

        req.flash('error', 'Access denied.');

        return res.redirect('/users');

    }

    const { userId } = req.params;

    try {
        await deleteUser(userId);
        
        // Audit Log
        await logAuditAction(

            req.session.user.users_id,

            'delete_user',
            userId,
            'user',

            { reason: 'Founder initiated deletion' }

        );

        req.flash('success', 'User account has been soft deleted.');

    } catch (error) {

        console.error('Delete user error:', error);

        req.flash('error', 'Failed to delete user.');

    }

    res.redirect('/users');

};

export {
    showUserRegistrationForm,
    processUserRegistrationForm,
    showLoginForm,
    processLoginForm,
    processLogout,
    requireLogin,
    requireRole,
    showDashboard,
    showUsers,
    userValidation,
    adminSuspendUser,
    adminVerifyUser,
    adminDeleteUser
};