
import { getHomeFeed, getPublicFeed, getFollowingFeed } from '../models/tweets.js';

export const showFeedPage = async (req, res) => {
  try {
    const isLoggedIn = !!req.session?.user;
    const user = req.session?.user || null;

    const { tab = 'for-you', limit = 20, offset = 0 } = req.query;

    let feed = [];

    if (!isLoggedIn) {
      feed = await getPublicFeed(limit, offset);
    } else {
      const userId = user.users_id;

      feed =
        tab === 'following'
          ? await getFollowingFeed(userId, limit, offset)
          : await getHomeFeed(userId, limit, offset);
    }

    res.render('feed', {
      title: 'Home',
      feed,
      user,
      isLoggedIn,
      activeTab: tab,
      isGuest: !isLoggedIn
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};