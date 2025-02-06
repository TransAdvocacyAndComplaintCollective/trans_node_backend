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


// POST request to store replies
router.post("/", (req, res) => {
  const { bbc_ref_number, intercept_id, bbc_reply } = req.body;

  // Basic validation for required fields
  if (!intercept_id || !bbc_reply) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  // Validate intercept_id format (UUID v4)
  const uuidV4Pattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  if (!uuidV4Pattern.test(intercept_id)) {
    return res.status(400).json({ error: "Invalid TACC Record ID format." });
  }

  // Check if intercept_id exists in intercepted_data
  const checkInterceptIdQuery = "SELECT id FROM intercepted_data WHERE id = ? LIMIT 1;";
  db.query(checkInterceptIdQuery, [intercept_id], (err, results) => {
    if (err) {
      console.error("Database error during intercept_id check:", err.message);
      return res.status(500).json({ error: "Internal server error." });
    }

    if (results.length === 0) {
      return res.status(400).json({ error: "Invalid intercept_id. No matching record found." });
    }

    // Proceed to insert the reply since intercept_id is valid
    const sanitizedReply = sanitizeHtml(bbc_reply);
    const insertReplyQuery = `INSERT INTO replies (bbc_ref_number, intercept_id, bbc_reply) VALUES (?, ?, ?);`;

    db.query(insertReplyQuery, [bbc_ref_number, intercept_id, sanitizedReply], (insertErr, insertResult) => {
      if (insertErr) {
        console.error("Error storing reply:", insertErr.message);
        return res.status(500).json({ error: "Failed to store reply.", details: insertErr.message });
      }

      res.status(200).json({ message: "Reply stored successfully.", id: insertResult.insertId });
    });
  });
});






module.exports = router;
