// importing express from express library

import express from "express";

const NODE_ENV = process.env.NODE_ENV?.toLowerCase() || "production";

const PORT = process.env.PORT || 3000;

const app = express();

app.get("/", (req, res) => {

  res.send("Welcome to HavenSocial - the next-gen Social Media platform!");

});

app.listen(PORT, () => {

  console.log(`Server is running at http://127.0.0.1:${PORT}`);

  console.log(`Environment: ${NODE_ENV}`);

});