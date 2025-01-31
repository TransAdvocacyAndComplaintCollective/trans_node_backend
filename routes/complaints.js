const express = require("express");
const db = require("../config/db");
const { validateUUID } = require("../middlewares/validateUUID");

const router = express.Router();

router.get("/:uuid", validateUUID, async (req, res) => {
  const { uuid } = req.params;

  const query = `
    SELECT 
      id,
      originUrl,
      description,
      programme,
      transmissiondate,
      transmissiontime,
      title,
      timestamp,
      sourceurl
    FROM intercepted_data 
    WHERE id = ? 
    LIMIT 1;
  `;

  try {
    const [results] = await db.promise().query(query, [uuid]);

    if (results.length === 0) {
      return res.status(404).json({ error: "No data found for the provided UUID." });
    }

    const complaintData = results[0];
    const response = {
      complaint: {
        id: complaintData.id,
        originUrl: complaintData.originUrl ? "[REDACTED]" : null,
        description: complaintData.description || null,
        programme: complaintData.programme || null,
        transmissiondate: complaintData.transmissiondate || null,
        transmissiontime: complaintData.transmissiontime || null,
        title: complaintData.title || null,
        timestamp: complaintData.timestamp || null,
        sourceurl: complaintData.sourceurl || null,
      },
    };

    console.log(`Complaint data accessed for ID: ${uuid}`);
    res.status(200).json(response);
  } catch (err) {
    console.error("Database fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch complaint data." });
  }
});


module.exports = router;
