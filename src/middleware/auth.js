
const setAuthLocals = (req, res, next) => {
    
    res.locals.isLoggedIn = !!req.session?.user;
    
    res.locals.user = req.session?.user || null;
    
    next();
    
};

export default setAuthLocals;