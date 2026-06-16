


// Defining controller functions for the homepage called showHomePage

const showHomePage = (req, res) => {

    const title = 'Find out what\'s happening right now';
  
    res.render('index', { title });
};

// Export function

export { showHomePage };