// Load environment variables
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./config/db"); // Database connection pool
const complaintRoutes = require("./routes/complaint");
const replyRoutes = require("./routes/replies");
const interceptRoutes = require("./routes/intercept");
const problematicRoutes = require(".routes/routes/problematic");
const json_copy = require("./routes/json_copy");

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 5555;

// Middleware setup
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/complaint", complaintRoutes);
app.use("/api/replies", replyRoutes);
app.use("/api/intercept", interceptRoutes);
app.use("/api/problematic", problematicRoutes);
app.use("/api/replay", json_copy);

app.get("/api", (req, res) => {
  res.json({ message: "Custom API response" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
