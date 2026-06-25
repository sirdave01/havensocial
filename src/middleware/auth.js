import { getUserProfile } from '../models/users.js';

const setAuthLocals = async (req, res, next) => {
    res.locals.isLoggedIn = !!req.session?.user;
    res.locals.user = req.session?.user || null;
    res.locals.isFounder = req.session?.user?.role_name === 'founder';

    // OPTIONAL: only enrich, NEVER overwrite session
    if (req.session?.user) {
        try {
            const viewerId = req.session?.user?.users_id || null;
            const profile = await getUserProfile(req.session.user.username, viewerId);

            if (profile) {
                res.locals.profile = profile; // ONLY for views
            }
        } catch (err) {
            console.error('Auth middleware error:', err);
        }
    }

    next();
};

export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/login');
  }
  next();
}

export default setAuthLocals;