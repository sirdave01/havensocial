
import { body, validationResult } from 'express-validator';

import { getUserProfile, updateUserProfile } from '../models/users.js';

import { upload } from '../middleware/upload.js';

const profileValidation = [

    body('fullName')
        .trim()
        .optional()
        .isLength({ max: 100 }).withMessage('Full name cannot exceed 100 characters'),

    body('displayName')
        .trim()
        .optional()
        .isLength({ max: 100 }).withMessage('Display name cannot exceed 100 characters'),

    body('bio')
        .trim()
        .optional()
        .isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters')
    
];

// Show Profile Page
const showProfile = async (req, res) => {

    const userTweets = await getUserTweets(profile.users_id, 10);

    const username = req.params.username || req.session.user?.username;

    try {

        const profile = await getUserProfile(username);

        if (!profile) {

            req.flash('error', 'User not found');

            return res.redirect('/home');

        }

        const isOwner = req.session.user && req.session.user.users_id === profile.users_id;

        res.render('profile', {

            title: `${profile.display_name || profile.username}'s Profile`,
            profile,
            userTweets,
            isOwner,
            user: req.session.user
        });

    } catch (error) {

        console.error('Profile error:', error);
        req.flash('error', 'Failed to load profile');
        res.redirect('/home');

    }

};

// Update Profile
const updateProfile = async (req, res) => {

    if (!req.session.user) {

        return res.redirect('/login');

    }

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

        errors.array().forEach(err => req.flash('error', err.msg));

        return res.redirect(`/profile/${req.session.user.username}`);

    }

    let profilePictureUrl = null;

    let removePhoto = req.body.removeProfilePicture === 'true';

    try {

        if (req.file) {

            profilePictureUrl = `/uploads/profile/${req.file.filename}`;

        } else if (removePhoto) {

            profilePictureUrl = null; // or default avatar path

        }

        const updatedUser = await updateUserProfile(

            req.session.user.users_id,

            req.body.fullName || null,

            req.body.displayName || null,

            req.body.bio || null,

            profilePictureUrl

        );

        // Update session
        if (req.session.user && updatedUser) {

            req.session.user.display_name = updatedUser.display_name;

            req.session.user.full_name = updatedUser.full_name;

            req.session.user.profile_picture_url = updatedUser.profile_picture_url;

        }

        req.flash('success', 'Profile updated successfully!');
        
        res.redirect(`/profile/${req.session.user.username}`);
        
    } catch (error) {
        
        console.error('Update profile error:', error);
        
        req.flash('error', `Failed to update profile: ${error.message}`);
        
        res.redirect(`/profile/${req.session.user.username}`);
        
    }

};

export { 
    showProfile, 
    updateProfile,
    profileValidation 
};