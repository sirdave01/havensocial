// importing express from express library

import 'dotenv/config';

import express from 'express';

import session from 'express-session';

import  MemoryStore from 'memorystore';

import flash from './src/middleware/flash.js';

import {setAuthLocals} from './src/middleware/auth.js';

import { fileURLToPath } from 'url';

import path from 'path';

import router from './src/routes.js';


// after the .env file is created we'll modify the server.js file to use the environment
// variables instead of hardcoding the values

const NODE_ENV = process.env.NODE_ENV?.toLowerCase() || "production";

const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.SESSION_SECRET;

// creating the __filename and __dirname variables to be used in the server.js file to get
// the current file name and directory name

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const app = express();

/**
  * Configure Express middleware
  */

// Set up session management

// Set up session management with MemoryStore
const sessionStore = new (MemoryStore(session))({

  checkPeriod: 86400000   // 24 hours - automatically clean expired sessions
  
});

app.use(session({

  secret: SESSION_SECRET,

  resave: false,

  saveUninitialized: false, // Changed to false (better practice)
    
  store: sessionStore,

  proxy: true,

  cookie: {

    maxAge: 607 * 24 * 60 * 60 * 1000,   // ← Changed to 7 days (much better UX)

    secure: NODE_ENV === 'production',

    httpOnly: true,

    sameSite: 'lax'

   } 
    
}));

// use flashmessage middleware to handle flash messages in the application

app.use(flash);

app.use(setAuthLocals);

// Allow Express to receive and process common POST data

app.use(express.urlencoded({ extended: true }));

app.use(express.json());

// Serve static files from the public directory

app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// Tell Express where to find your templates
app.set('views', path.join(__dirname, 'src/views'));

// Middleware to log all incoming requests
app.use((req, res, next) => {

  if (NODE_ENV === 'development') {
      
    console.log(`${req.method} ${req.url}`);
    
  }
  
  next(); // Pass control to the next middleware or route
  
});

// Middleware to make NODE_ENV available to all templates
app.use((req, res, next) => {

  res.locals.NODE_ENV = NODE_ENV;
  
  next();
  
});

// ====================== STATIC RESOURCE ROUTES ======================

// Prevent unnecessary 404 errors for common browser requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/site.webmanifest', (req, res) => res.status(204).end());

// Fix the specific path causing the error
app.get('/profile/images/favicon/site.webmanifest', (req, res) => {
    res.status(204).end();
});

// You can add more common paths if needed
app.get('/images/favicon/site.webmanifest', (req, res) => res.status(204).end());

/**
  * Routes
  */

// dynamically populating the page titles

app.use(router); // Use the router for all routes defined in src/routes.js

// adding the catch-all error route for 404 errors

app.use((req, res, next) => {

  const err = new Error('Page Not Found');

  err.status = 404;

  next(err);

});


// creating the global error handler middleware to
// catch any errors that occur in the routes and send a response to the client

app.use((err, req, res, next) => {

  // log error details for debugging

  console.error('Error Occurred:', err.message);


  console.error('Stack Trace:', err.stack);

  // Determine status and template based on error type
  
  const status = err.status || 500;

  const template = status === 404 ? '404' : '500';

  // Prepare data for the template

  const context = {

    title: status === 404 ? 'Page Not Found' : 'Server Error',

    error: err.message,

    stack: err.stack

  };

  // Render the appropriate error template with the context data
  
  res.status(status).render(`errors/${template}`, context);

});


app.listen(PORT, async () => {

  try {

    console.log(`Server is running at http://127.0.0.1:${PORT}`);

    console.log(`Environment: ${NODE_ENV}`);

  } catch (error) {

    console.error('Error connecting to the database:', error);

  }

});