// importing express from express library

import express from "express";

import { fileURLToPath } from 'url';

import path from 'path';

const NODE_ENV = process.env.NODE_ENV?.toLowerCase() || "production";

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const app = express();

/**
  * Configure Express middleware
  */

// Serve static files from the public directory

app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// Tell Express where to find your templates
app.set('views', path.join(__dirname, 'src/views'));

/**
  * Routes
  */

app.get('/', async (req, res) => {

  const title = 'Find out what\'s happening right now';
  
    res.render('index', { title });
    
});

app.get('/feed', async (req, res) => {

  const title = 'Feed';

    res.render('feed', {title});
});

app.get('/register', async (req, res) => {

  const title = 'User Registration';

    res.render('register', {title});
});

app.get('/login', async (req, res) => {

  const title = 'Welcome Back, Please, Log In';

    res.render('login', {title});
});


app.listen(PORT, () => {

  console.log(`Server is running at http://127.0.0.1:${PORT}`);

  console.log(`Environment: ${NODE_ENV}`);

});