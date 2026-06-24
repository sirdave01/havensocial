import { getHomeFeed } from '../models/tweets.js';

export const showFeedPage = async (req, res) => {

    try {

        if (!req.session?.user) {

            req.flash('error', 'Please log in to view your feed');

            return res.redirect('/login');

        }

        const userId = req.session.user.users_id;

        const { limit = 20, offset = 0 } = req.query;

        const feed = await getHomeFeed(userId, parseInt(limit), parseInt(offset));

        res.render('feed', {
             
            title: 'Home Feed',
            feed,
            user: req.session.user,
            isLoggedIn: true
        });
        
    } catch (error) {
        
        console.error('Feed error:', error);
        
        req.flash('error', 'Failed to load feed');
        
        res.redirect('/home');
        
    }
    
};