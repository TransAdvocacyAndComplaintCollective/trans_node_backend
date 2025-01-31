const express = require("express");
const db = require("../config/db");
const { validateUUID } = require("../middlewares/validateUUID");

const router = express.Router();

router.get("/:uuid", validateUUID, (req, res) => {
  const { uuid } = req.params;
  const query = "SELECT * FROM replies WHERE intercept_id = ? ORDER BY timestamp ASC;";

  db.query(query, [uuid], (err, results) => {
    if (err) {
      console.error("Database fetch error:", err.message);
      return res.status(500).json({ error: "Failed to fetch replies." });
    }

    res.status(200).json(results);
  });
});

module.exports = router;
