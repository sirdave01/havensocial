import { getHomeFeed } from '../models/tweets.js';
import { db } from '../models/db.js';

export const showFeedPage = async (req, res) => {
    try {
        let feed = [];
        const isLoggedIn = !!req.session?.user;
        const user = req.session?.user || null;

        const { limit = 20, offset = 0 } = req.query;

        if (isLoggedIn) {
            const userId = req.session.user.users_id;
            feed = await getHomeFeed(userId, parseInt(limit), parseInt(offset));
        } else {
            feed = await getPublicFeed(parseInt(limit), parseInt(offset));
        }

        res.render('feed', {
            title: 'Home Feed',
            feed,
            user,
            isLoggedIn,
            isGuest: !isLoggedIn
        });
        
    } catch (error) {
        console.error('Feed error:', error);
        req.flash('error', 'Failed to load feed');
        res.redirect('/');
    }
};

const getPublicFeed = async (limit = 20, offset = 0) => {
    const query = `
        SELECT 
            t.*,
            u.username, 
            u.display_name, 
            u.profile_picture_url, 
            u.verified
        FROM tweets t
        JOIN users u ON t.user_id = u.users_id
        WHERE t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT $1 OFFSET $2;
    `;

    const result = await db.query(query, [limit, offset]);
    return result.rows;
};