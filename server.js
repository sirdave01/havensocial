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

/**
  * Routes
  */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/index.html'));
});

app.get('/feed', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/feed.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/login.html'));
});

app.listen(PORT, () => {

  console.log(`Server is running at http://127.0.0.1:${PORT}`);

  console.log(`Environment: ${NODE_ENV}`);

});