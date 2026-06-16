

// defining controllers for the feedPage

const showFeedPage = async (req, res) => {

    const getAllFeed = await getAllFeeds();

    const title = 'Feed';

    res.render('feed', {title});
};



export { showFeedPage };