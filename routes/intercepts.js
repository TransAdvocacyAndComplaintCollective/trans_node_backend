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
  if (!privacyPolicyAccepted  || privacyPolicyAccepted !== true) {
    return res.status(400).json({ error: "Privacy policy must be accepted." });
  }
  console.log("Privacy policy accepted",privacyPolicyAccepted);

  if (!originUrl || !interceptedData) {
    console.error("Invalid request body:", req.body);
    return res.status(400).json({ error: "Invalid request body." });
  }

  // Sanitize each field in interceptedData
  const sanitizedData = {};
  for (const [key, value] of Object.entries(interceptedData)) {
    sanitizedData[key] = sanitizeHtml(value || "");
  }

  // Validate captcha
  if (!sanitizedData.captcha || sanitizedData.captcha.length < 64) {
    console.error("Captcha validation failed:", sanitizedData.captcha);
    return res.status(400).json({ error: "Captcha is required and must be valid." });
  }

  // Remove captcha from data
  delete sanitizedData.captcha;

  const id = generateId();
  const fields = Object.keys(sanitizedData);
  const values = fields.map((field) => sanitizedData[field]);
  const placeholders = fields.map(() => "?").join(", ");
  const insertQuery = `INSERT INTO intercepted_data (id, ${fields.join(", ")}) VALUES (?, ${placeholders});`;

  db.query(insertQuery, [id, ...values], (err) => {
    if (err) {
      console.error("Database insertion error:", {
        message: err.message,
        stack: err.stack,
        query: insertQuery,
        values: [id, ...values],
      });
      return res.status(500).json({ error: "Failed to store data." });
    }

    console.log("Data successfully inserted:", { id, sanitizedData });
    res.status(200).json({ message: "Data stored successfully.", id });
  });
});

module.exports = router;
