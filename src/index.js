import express from "express";

const app = express();
const port = 8000;

app.get("/", (req, res) => {
  res.send("Welcome to Sportz!");
});

app.listen(port, () => {
  console.log(`Server is connected and running on port ${port}`);
});
