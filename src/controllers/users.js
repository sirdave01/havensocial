

// creating the controller function for the register page

const showUserRegistrationForm = (req, res) => {

    const title = 'User Registration';

    res.render('register', { title });

};
 
export { showUserRegistrationForm };