import express from 'express';

import { showFeedPage } from "./controllers/feed.js";
import { showNotificationsPage } from "./controllers/notification.js";

import { tweetUpload } from './middleware/tweetupload.js';
import { upload } from './middleware/upload.js';
import { requireAuth } from './middleware/auth.js';

// ================= TWEETS =================
import {
    createTweetController,
    getTweetController,
    getUserTweetsController,
    deleteTweetController,
    updateTweetController,
    replyTweetController,
    incrementViewController,
    pinTweetController,
    retweetController,
    showTweetDetailPage
} from "./controllers/tweets.js";

// ================= FOLLOW =================
import {
    followUserController,
    unfollowUserController,
    getFollowingController,
    getFollowersController
} from "./controllers/follow.js";

// ================= LIKE =================
import {
    likeTweetController,
    unlikeTweetController
} from "./controllers/like.js";

// ================= USERS =================
import {
    showUserRegistrationForm,
    processUserRegistrationForm,
    showLoginForm,
    processLoginForm,
    processLogout,
    requireRole,
    showDashboard,
    showUsers,
    userValidation,
    adminSuspendUser,
    adminVerifyUser,
    adminDeleteUser,
    showSearchResults
} from "./controllers/users.js";

// ================= PROFILE =================
import {
    showProfile,
    updateProfile,
    profileValidation,
    showFollowers,
    showFollowing
} from "./controllers/profile.js";

// ================= OTHER =================
import { showHomePage } from "./controllers/index.js";
import { testErrorPage } from "./controllers/errors.js";

const router = express.Router();

// ================= HOME =================
router.get('/', showHomePage);

// ================= FEED =================
router.get('/feed', requireAuth, showFeedPage);

// ================= NOTIFICATIONS =================
router.get('/notifications', requireAuth, showNotificationsPage);

// ================= TWEETS =================
router.post('/tweets', requireAuth, tweetUpload.single('media'), createTweetController);

router.get('/tweets/:tweetId', requireAuth, getTweetController);

router.get('/tweets/user/:userId', requireAuth, getUserTweetsController);

router.delete('/tweets/:tweetId', requireAuth, deleteTweetController);

router.patch('/tweets/:tweetId', requireAuth, updateTweetController);

router.get('/tweet/:tweetId', showTweetDetailPage);

// replies
router.post('/tweets/reply', requireAuth, replyTweetController);

// views
router.post('/tweets/:tweetId/view', requireAuth, incrementViewController);

// pin
router.post('/tweets/pin', requireAuth, pinTweetController);

// retweet
router.post('/retweets', requireAuth, retweetController);

// ================= LIKES =================
router.post('/likes', requireAuth, likeTweetController);
router.post('/likes/unlike', requireAuth, unlikeTweetController);

// ================= FOLLOW =================
router.post('/follow', requireAuth, followUserController);
router.post('/unfollow', requireAuth, unfollowUserController);

router.get('/following/:userId', requireAuth, getFollowingController);
router.get('/following', requireAuth, getFollowingController);

router.get('/followers/:userId', requireAuth, getFollowersController);
router.get('/followers', requireAuth, getFollowersController);

// ================= AUTH =================
router.get('/register', showUserRegistrationForm);
router.post('/register', userValidation, processUserRegistrationForm);

router.get('/login', showLoginForm);
router.post('/login', processLoginForm);
router.get('/logout', processLogout);

// ================= PROFILE =================
router.get('/profile/:username', requireAuth, showProfile);
router.get('/:username', showProfile);

router.get('/:username/followers', requireAuth, showFollowers);
router.get('/:username/following', requireAuth, showFollowing);

router.post('/profile/update', requireAuth, upload.single('profilePicture'), profileValidation, updateProfile);

// ================= OTHER =================
router.get('/search', requireAuth, showSearchResults);
router.get('/test-error', testErrorPage);

// ================= ADMIN =================
router.get('/dashboard', requireAuth, requireRole('founder'), showDashboard);
router.get('/users', requireAuth, requireRole('founder'), showUsers);

router.post('/users/:userId/suspend', requireAuth, requireRole('founder'), adminSuspendUser);
router.post('/users/:userId/verify', requireAuth, requireRole('founder'), adminVerifyUser);
router.post('/users/:userId/delete', requireAuth, requireRole('founder'), adminDeleteUser);

export default router;