
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
    userValidation } from "./controllers/users.js";

import { showHomePage } from "./controllers/index.js";

import { testErrorPage } from "./controllers/errors.js";





// create the router function to get the pages

const router = express.Router();


// middleware function to make the current year available in all EJS templates

// main routes


router.get('/', showHomePage);

router.get('/feed', showFeedPage);

// user registration routes
router.get('/register', showUserRegistrationForm);
router.post('/register', userValidation, processUserRegistrationForm, );

// user login routes
router.get('/login', showLoginForm);
router.post('/login', processLoginForm);

// user logout route
router.get('/logout', processLogout);

router.get('/test-error', testErrorPage);










export default router;