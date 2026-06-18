import { getUserProfile } from '../models/users.js';

const setAuthLocals = async (req, res, next) => {
    
    res.locals.isLoggedIn = !!req.session?.user;
    
    res.locals.isFounder = !!(req.session.user && req.session.user.role_name === 'founder');
    
    if (req.session?.user) {
        try {
            // Refresh user data from database on every request
            const freshProfile = await getUserProfile(req.session.user.username);
            
            if (freshProfile) {
                // Update session with latest data
                req.session.user = {
                    ...req.session.user,
                    display_name: freshProfile.display_name,
                    full_name: freshProfile.full_name,
                    profile_picture_url: freshProfile.profile_picture_url,
                    bio: freshProfile.bio,
                    verified: freshProfile.verified,
                    // Add more fields if needed in the future
                };
            }
        } catch (error) {
            console.error('Failed to refresh user profile in middleware:', error);
            // Don't crash the request if refresh fails
        }
    }

    res.locals.user = req.session?.user || null;
    
    next();
};

export default setAuthLocals;