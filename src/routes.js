
import express from 'express';

import { showFeedPage } from "./controllers/feed.js";

import { showUserRegistrationForm } from "./controllers/users.js";

import { showHomePage } from "./controllers/index.js";

import { testErrorPage } from "./controllers/errors.js";





// create the router function to get the pages

const router = express.Router();


// middleware function to make the current year available in all EJS templates

// main routes


router.get('/', showHomePage);

router.get('/feed', showFeedPage);

router.get('/register', showUserRegistrationForm);

router.get('/test-error', testErrorPage);










export default router;