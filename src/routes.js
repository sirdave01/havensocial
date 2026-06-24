import express from 'express';

import { showFeedPage } from "./controllers/feed.js";
import { showNotificationsPage } from "./controllers/notification.js";

// Tweet Controllers
import { 
    createTweetController,
    getTweetController,
    getUserTweetsController,
    deleteTweetController 
} from "./controllers/tweets.js";

// Follow Controllers
import { 
    followUserController,
    unfollowUserController,
    getFollowingController,
    getFollowersController 
} from "./controllers/follow.js";

// Like Controllers
import { 
    likeTweetController,
    unlikeTweetController 
} from "./controllers/like.js";

// User & Auth Controllers
import { 
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
    adminDeleteUser,
    showSearchResults
} from "./controllers/users.js";

import { showHomePage } from "./controllers/index.js";
import { testErrorPage } from "./controllers/errors.js";

// Profile Controller
import { 
    showProfile, 
    updateProfile, 
    profileValidation 
} from "./controllers/profile.js";

import { upload } from './middleware/upload.js';

const router = express.Router();

// ====================== MAIN PUBLIC ROUTES ======================
router.get('/', showHomePage);

// ====================== PROTECTED FEED & NOTIFICATIONS ======================
router.get('/feed', showFeedPage);
router.get('/notifications', requireLogin, showNotificationsPage);

// ====================== TWEET ROUTES ======================
router.post('/tweets', requireLogin, upload.single('media'), createTweetController);// Create tweet
router.post('/tweets/reply', requireLogin, createTweetController); //reply to tweet
router.get('/tweets/:tweetId', getTweetController);                    // Get single tweet
router.get('/tweets/user/:userId', getUserTweetsController);           // Get user tweets
router.delete('/tweets/:tweetId', requireLogin, deleteTweetController); // Delete tweet

// ====================== FOLLOW ROUTES ======================
router.post('/follow', requireLogin, followUserController);
router.post('/unfollow', requireLogin, unfollowUserController);
router.get('/following', requireLogin, getFollowingController);
router.get('/following/:userId', requireLogin, getFollowingController);

router.get('/followers', requireLogin, getFollowersController);
router.get('/followers/:userId', requireLogin, getFollowersController);

// ====================== LIKE ROUTES ======================
router.post('/likes', requireLogin, likeTweetController);
router.post('/likes/unlike', requireLogin, unlikeTweetController);   // or use DELETE

// ====================== AUTH ROUTES ======================
router.get('/register', showUserRegistrationForm);
router.post('/register', userValidation, processUserRegistrationForm);

router.get('/login', showLoginForm);
router.post('/login', processLoginForm);
router.get('/logout', processLogout);

// ====================== PROFILE ROUTES ======================
router.get('/profile/:username', requireLogin, showProfile);
router.post('/profile/update', requireLogin, upload.single('profilePicture'), profileValidation, updateProfile);

// ====================== OTHER ROUTES ======================
router.get('/search', requireLogin, showSearchResults);
router.get('/test-error', testErrorPage);

// Founder-only routes
router.get('/dashboard', requireLogin, requireRole('founder'), showDashboard);
router.get('/users', requireLogin, requireRole('founder'), showUsers);

router.post('/users/:userId/suspend', requireLogin, requireRole('founder'), adminSuspendUser);
router.post('/users/:userId/verify', requireLogin, requireRole('founder'), adminVerifyUser);
router.post('/users/:userId/delete', requireLogin, requireRole('founder'), adminDeleteUser);

export default router;