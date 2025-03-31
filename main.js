// Load environment variables
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./config/db"); // Database connection pool
const MCCRoutes = require("./routes/MCC");
const json_copy = require("./routes/json_copy");

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 5555;

// Middleware setup
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/", MCCRoutes);
app.use("/api/json_copy", json_copy);

app.get("/api", (req, res) => {
  res.json({ message: "Custom API response" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
