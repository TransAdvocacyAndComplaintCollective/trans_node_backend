const express = require("express");
const db = require("../config/db");
const crypto = require("crypto");
const sanitizeHtml = require("sanitize-html");

const router = express.Router();

function generateId() {
  return crypto.randomUUID();
}

router.post("/", (req, res) => {
  const { originUrl, interceptedData, privacyPolicyAccepted } = req.body;
  if (!privacyPolicyAccepted) {
    return res.status(400).json({ error: "Privacy policy must be accepted." });
  }

  if (!originUrl || !interceptedData) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const sanitizedData = {};
  for (const [key, value] of Object.entries(interceptedData)) {
    sanitizedData[key] = sanitizeHtml(value || "");
  }

  const id = generateId();
  const fields = Object.keys(sanitizedData);
  const values = fields.map((field) => sanitizedData[field]);
  const placeholders = fields.map(() => "?").join(", ");
  const insertQuery = `INSERT INTO intercepted_data (id, ${fields.join(", ")}) VALUES (?, ${placeholders});`;

  db.query(insertQuery, [id, ...values], (err) => {
    if (err) {
      console.error("Database insertion error:", err.message);
      return res.status(500).json({ error: "Failed to store data." });
    }

    res.status(200).json({ message: "Data stored successfully.", id });
  });
});

module.exports = router;
