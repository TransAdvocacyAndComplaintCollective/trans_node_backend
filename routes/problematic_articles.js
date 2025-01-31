const express = require("express");
const db = require("../config/db");

const router = express.Router();

router.get("/", (req, res) => {
  const fetchQuery = "SELECT * FROM problematic_article ORDER BY timestamp DESC;";
  db.query(fetchQuery, (err, results) => {
    if (err) {
      console.error("Database fetch error:", err.message);
      return res.status(500).json({ error: "Failed to fetch data." });
    }

    res.status(200).json(results);
  });
});

module.exports = router;
