
import express from 'express';

import { showFeedPage } from "./controllers/feed.js";

import { showUserRegistrationForm,
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
    adminDeleteUser} from "./controllers/users.js";

import { showHomePage } from "./controllers/index.js";

import { testErrorPage } from "./controllers/errors.js";

// Import Profile Controller
import { 
    showProfile, 
    updateProfile, 
    profileValidation 
} from "./controllers/profile.js";

import { upload } from './middleware/upload.js';



// create the router function to get the pages

const router = express.Router();


// Middleware to make current year available in all EJS templates (if you have it)

// ====================== MAIN ROUTES ======================
router.get('/', showHomePage);
router.get('/feed', showFeedPage);

// ====================== AUTH ROUTES ======================
router.get('/register', showUserRegistrationForm);
router.post('/register', userValidation, processUserRegistrationForm);

router.get('/login', showLoginForm);
router.post('/login', processLoginForm);

router.get('/logout', processLogout);

// ====================== PROFILE ROUTES ======================
// Protected: Only logged-in users can view profiles
router.get('/profile/:username', requireLogin, showProfile);

// Protected: Only logged-in users can update their own profile
router.post('/profile/update', requireLogin, upload.single('profilePicture'), profileValidation, updateProfile);

// ====================== OTHER ROUTES ======================
router.get('/test-error', testErrorPage);

// Optional: Founder-only routes
router.get('/dashboard', requireLogin, showDashboard);
router.get('/users', requireLogin, requireRole('founder'), showUsers);
// User Management Routes (Founder Only)
router.get('/users', requireLogin, requireRole('founder'), showUsers);

router.post('/users/:userId/suspend', requireLogin, requireRole('founder'), adminSuspendUser);
router.post('/users/:userId/verify', requireLogin, requireRole('founder'), adminVerifyUser);
router.post('/users/:userId/delete', requireLogin, requireRole('founder'), adminDeleteUser);










export default router;