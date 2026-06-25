import {
  getHomeFeed,
  getFollowingFeed
} from '../models/tweets.js';

/**
 * Extract safe user ID
 */
function getUserId(user) {
  return user?.users_id || user?.user_id || null;
}

/**
 * Normalize feed tab
 */
function normalizeTab(tab) {
  const allowed = ['for-you', 'following'];
  return allowed.includes(tab) ? tab : 'for-you';
}

/**
 * Safe pagination parser
 */
function parsePagination(query) {
  const limit = Math.min(parseInt(query.limit || 20, 10), 50);
  const offset = Math.max(parseInt(query.offset || 0, 10), 0);

  return { limit, offset };
}

export const showFeedPage = async (req, res) => {
  try {
    const user = req.session?.user;

    const userId = getUserId(user);

    /**
     * 🔐 HARD GUARD: No session = no access
     */
    if (!user || !userId) {
      return res.redirect('/login');
    }

    const { tab, limit, offset } = parsePagination(req.query);
    const activeTab = normalizeTab(tab);

    let feed = [];

    /**
     * =========================
     * AUTHENTICATED FEED ONLY
     * =========================
     */

    if (activeTab === 'following') {
      feed = await getFollowingFeed(userId, limit, offset);
    } else {
      feed = await getHomeFeed(userId, limit, offset);
    }

    return res.render('feed', {
      title: 'Home',
      feed,
      user,
      isLoggedIn: true,
      activeTab
    });

  } catch (err) {
    console.error('[FEED ERROR]', err);

    return res.status(500).render('errors/500', {
      title: 'Feed Error',
      error: 'Unable to load feed',
      stack: process.env.NODE_ENV === 'development' ? err.stack : null
    });
  }
};