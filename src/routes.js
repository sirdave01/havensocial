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
    profileValidation,
    showFollowers,
    showFollowing
} from "./controllers/profile.js";

import { upload } from './middleware/upload.js';

import { requireAuth } from './middleware/auth.js';

const router = express.Router();

// ====================== MAIN PUBLIC ROUTES ======================
router.get('/', showHomePage);

// ====================== PROTECTED FEED & NOTIFICATIONS ======================
router.get('/feed', requireAuth, showFeedPage);
router.get('/notifications', requireAuth, showNotificationsPage);

// ====================== TWEET ROUTES ======================
router.post('/tweets', requireAuth, upload.single('media'), createTweetController);// Create tweet
router.post('/tweets/reply', requireAuth, createTweetController); //reply to tweet
router.get('/tweets/:tweetId', requireAuth, getTweetController);                    // Get single tweet
router.get('/tweets/user/:userId', requireAuth, getUserTweetsController);           // Get user tweets
router.delete('/tweets/:tweetId', requireAuth, deleteTweetController); // Delete tweet

// ====================== FOLLOW ROUTES ======================
router.post('/follow', requireAuth, followUserController);
router.post('/unfollow', requireAuth, unfollowUserController);
// Following
router.get('/following/:userId', requireAuth, getFollowingController);
router.get('/following', requireAuth, getFollowingController);
// Followers
router.get('/followers/:userId', requireAuth, getFollowersController);
router.get('/followers', requireAuth, getFollowersController);

// ====================== LIKE ROUTES ======================
router.post('/likes', requireAuth, likeTweetController);
router.post('/likes/unlike', requireAuth, unlikeTweetController);   // or use DELETE

// ====================== AUTH ROUTES ======================
router.get('/register', showUserRegistrationForm);
router.post('/register', userValidation, processUserRegistrationForm);

router.get('/login', showLoginForm);
router.post('/login', processLoginForm);
router.get('/logout', processLogout);

// ====================== PROFILE ROUTES ======================
router.get('/profile/:username', requireAuth, showProfile);
router.get('/:username', showProfile);
router.get('/:username/followers', requireAuth, showFollowers);
router.get('/:username/following', requireAuth, showFollowing);
router.post('/profile/update', requireAuth, upload.single('profilePicture'), profileValidation, updateProfile);

// ====================== OTHER ROUTES ======================
router.get('/search', requireAuth, showSearchResults);
router.get('/test-error', testErrorPage);

// Founder-only routes
router.get('/dashboard', requireAuth, requireRole('founder'), showDashboard);
router.get('/users', requireAuth, requireRole('founder'), showUsers);

router.post('/users/:userId/suspend', requireAuth, requireRole('founder'), adminSuspendUser);
router.post('/users/:userId/verify', requireAuth, requireRole('founder'), adminVerifyUser);
router.post('/users/:userId/delete', requireAuth, requireRole('founder'), adminDeleteUser);

export default router;