// the controller path for the testErrorPage function

// defining the controller function for the test error page called testErrorPage

// error handler for 500

const testErrorPage = (req, res, next) => {

  const err = new Error('This is a test error');

  err.status = 500;

    next(err);
};

export { testErrorPage };