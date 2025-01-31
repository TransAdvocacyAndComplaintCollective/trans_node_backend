const express = require("express");
const db = require("../config/db");
const { validateUUID } = require("../middlewares/validateUUID");

const router = express.Router();

router.get("/:uuid", validateUUID, (req, res) => {
  const { uuid } = req.params;

  // Corrected query: Order by timestamp instead of nonexistent reply_order
  const query = "SELECT * FROM replies WHERE intercept_id = ? ORDER BY timestamp ASC;";

  console.log(`Executing Query: ${query} with UUID: ${uuid}`); // Debugging: Log the query and UUID

  db.query(query, [uuid], (err, results) => {
    if (err) {
      console.error("Database fetch error:", err.message);
      return res.status(500).json({ error: "Failed to fetch replies." }); // Correct status code
    }

    res.status(200).json(results);
  });
});


module.exports = router;
