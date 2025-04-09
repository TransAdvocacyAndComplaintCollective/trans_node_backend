require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const crypto = require("crypto");
const sanitizeHtml = require("sanitize-html");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const util = require("util");
const unlinkAsync = util.promisify(fs.unlink);

const router = express.Router();

// Apply middlewares
router.use(cors());
router.use(express.json());

// Create a MySQL connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "your_mysql_username",
  password: process.env.DB_PASSWORD || "your_mysql_password",
  database: process.env.DB_NAME || "intercepted_data_db",
  port: process.env.DB_PORT || 3306,
  connectionLimit: 10,
});

// Test the database connection and create required tables
db.getConnection((err, connection) => {
  if (err) {
    console.error("Database connection error:", err.message);
    process.exit(1);
  }
  console.log("Connected to MySQL database.");
  connection.release();

  // Create necessary tables
  createInterceptedDataTable();
  createIPSOFieldsTable();
  createIPSOBreachesTable();
  createRepliesTable();
  createProblematicTable();
  createFileUploadsTable();
});

// ==================== TABLE CREATION FUNCTIONS ====================

function createInterceptedDataTable() {
  const createTableQuery = `
  CREATE TABLE IF NOT EXISTS intercepted_data (
    id VARCHAR(36) PRIMARY KEY,
    source ENUM('BBC', 'IPSO') NOT NULL DEFAULT 'BBC',
    originUrl VARCHAR(255),
    title VARCHAR(255),
    description TEXT,
    emailaddress VARCHAR(255),
    firstname VARCHAR(255),
    lastname VARCHAR(255),
    salutation VARCHAR(255),
    generalissue1 TEXT,
    intro_text TEXT,
    iswelsh VARCHAR(10),
    liveorondemand VARCHAR(50),
    localradio VARCHAR(255),
    make VARCHAR(255),
    moderation_text TEXT,
    network VARCHAR(255),
    outside_the_uk VARCHAR(10),
    platform VARCHAR(255),
    programme VARCHAR(255),
    programmeid VARCHAR(255),
    reception_text TEXT,
    redbuttonfault VARCHAR(255),
    region VARCHAR(255),
    responserequired VARCHAR(255),
    servicetv VARCHAR(255),
    sounds_text TEXT,
    sourceurl VARCHAR(255),
    subject VARCHAR(255),
    transmissiondate VARCHAR(50),
    transmissiontime VARCHAR(50),
    under18 VARCHAR(10),
    verifyform VARCHAR(255),
    complaint_nature VARCHAR(255),
    complaint_nature_sounds VARCHAR(255),
    ipso_terms BOOLEAN,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;
  `;
  db.query(createTableQuery, (err) => {
    if (err) {
      console.error("Error creating intercepted_data table:", err.message);
    } else {
      console.log("Table 'intercepted_data' created or already exists.");
      // Ensure additional columns exist if necessary
      addColumnIfNotExists("source", "ENUM('BBC', 'IPSO') NOT NULL DEFAULT 'BBC'", "id");
      addColumnIfNotExists("ipso_terms", "BOOLEAN", "complaint_nature_sounds");
    }
  });
}

function addColumnIfNotExists(columnName, columnDefinition, afterColumn) {
  const dbName = process.env.DB_NAME || "intercepted_data_db";
  const checkQuery = `
    SELECT COUNT(*) AS count 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'intercepted_data' 
      AND COLUMN_NAME = ?;
  `;
  db.query(checkQuery, [dbName, columnName], (err, results) => {
    if (err) {
      console.error(`Error checking column ${columnName}:`, err.message);
      return;
    }
    if (results[0].count === 0) {
      const alterQuery = `ALTER TABLE intercepted_data ADD COLUMN ${columnName} ${columnDefinition} AFTER ${afterColumn};`;
      db.query(alterQuery, (err2) => {
        if (err2) {
          console.error(`Error adding column ${columnName}:`, err2.message);
        } else {
          console.log(`Added column ${columnName} to intercepted_data.`);
        }
      });
    } else {
      console.log(`Column ${columnName} already exists in intercepted_data.`);
    }
  });
}

function createIPSOFieldsTable() {
  const query = `
  CREATE TABLE IF NOT EXISTS ipso_complaint_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id VARCHAR(36),
    field_order INT,
    field_value TEXT,
    FOREIGN KEY (complaint_id) REFERENCES intercepted_data(id) ON DELETE CASCADE
  ) ENGINE=InnoDB;
  `;
  db.query(query, (err) => {
    if (err) {
      console.error("Error creating ipso_complaint_fields table:", err.message);
    } else {
      console.log("Table 'ipso_complaint_fields' created or already exists.");
    }
  });
}

function createIPSOBreachesTable() {
  const query = `
  CREATE TABLE IF NOT EXISTS ipso_code_breaches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id VARCHAR(36),
    clause VARCHAR(255),
    details TEXT,
    FOREIGN KEY (complaint_id) REFERENCES intercepted_data(id) ON DELETE CASCADE
  ) ENGINE=InnoDB;
  `;
  db.query(query, (err) => {
    if (err) {
      console.error("Error creating ipso_code_breaches table:", err.message);
    } else {
      console.log("Table 'ipso_code_breaches' created or already exists.");
    }
  });
}

function createRepliesTable() {
  const query = `
  CREATE TABLE IF NOT EXISTS replies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bbc_ref_number VARCHAR(255) NOT NULL,
    intercept_id VARCHAR(36) NOT NULL,
    bbc_reply TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (intercept_id) REFERENCES intercepted_data(id) ON DELETE CASCADE
  ) ENGINE=InnoDB;
  `;
  db.query(query, (err) => {
    if (err) {
      console.error("Error creating replies table:", err.message);
    } else {
      console.log("Table 'replies' created or already exists.");
    }
  });
}

function createProblematicTable() {
  const query = `
  CREATE TABLE IF NOT EXISTS problematic_article (
    URL VARCHAR(255) PRIMARY KEY,
    title TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;
  `;
  db.query(query, (err) => {
    if (err) {
      console.error("Error creating problematic_article table:", err.message);
    } else {
      console.log("Table 'problematic_article' created or already exists.");
    }
  });
}

function createFileUploadsTable() {
  const query = `
  CREATE TABLE IF NOT EXISTS file_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    taccRecordId VARCHAR(36) NOT NULL,
    fileTitle VARCHAR(255),
    originalName VARCHAR(255),
    filename VARCHAR(255),
    filePath VARCHAR(255),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (taccRecordId) REFERENCES intercepted_data(id) ON DELETE CASCADE
  ) ENGINE=InnoDB;
  `;
  db.query(query, (err) => {
    if (err) {
      console.error("Error creating file_uploads table:", err.message);
    } else {
      console.log("Table 'file_uploads' created or already exists.");
    }
  });
}

// ==================== MIDDLEWARES & MULTER SETUP ====================

// Validate UUID format for endpoints using params
function validateUUID(req, res, next) {
  const { uuid } = req.params;
  const uuidV4Pattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  if (!uuidV4Pattern.test(uuid)) {
    return res.status(400).json({ error: "Invalid UUID format." });
  }
  next();
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB per file
});

// ==================== ENDPOINTS ====================

// GET /api/complaint/:uuid endpoint
router.get("/complaint/:uuid", validateUUID, async (req, res) => {
  const { uuid } = req.params;
  const query = `
    SELECT 
      id,
      originUrl,
      title,
      description,
      programme,
      transmissiondate,
      transmissiontime,
      sourceurl,
      timestamp,
      source
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
    const responseData = {
      complaint: {
        id: complaintData.id,
        originUrl: complaintData.originUrl ? "[REDACTED]" : null,
        title: complaintData.title || null,
        description: complaintData.description || null,
        programme: complaintData.programme || null,
        transmissiondate: complaintData.transmissiondate || null,
        transmissiontime: complaintData.transmissiontime || null,
        sourceurl: complaintData.sourceurl || null,
        timestamp: complaintData.timestamp || null,
        source: complaintData.source || "BBC",
      },
    };

    if (complaintData.source === "IPSO") {
      const ipsoFieldsQuery = `
        SELECT field_order, field_value
        FROM ipso_complaint_fields
        WHERE complaint_id = ?
        ORDER BY field_order ASC;
      `;
      const ipsoCodeBreachesQuery = `
        SELECT clause, details
        FROM ipso_code_breaches
        WHERE complaint_id = ?;
      `;
      const [fieldsResult, breachesResult] = await Promise.all([
        db.promise().query(ipsoFieldsQuery, [uuid]),
        db.promise().query(ipsoCodeBreachesQuery, [uuid])
      ]);
      responseData.complaint.ipsoFields = fieldsResult[0];
      responseData.complaint.ipsoCodeBreaches = breachesResult[0];
    }
    console.log(`Complaint data accessed for ID: ${uuid}`);
    res.status(200).json(responseData);
  } catch (err) {
    console.error("Database fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch complaint data." });
  }
});

// GET /api/replies/:uuid endpoint
router.get("/replies/:uuid", validateUUID, (req, res) => {
  const { uuid } = req.params;
  const query = "SELECT * FROM replies WHERE intercept_id = ? ORDER BY timestamp ASC;";
  console.log(`Executing Query: ${query} with UUID: ${uuid}`);
  db.query(query, [uuid], (err, results) => {
    if (err) {
      console.error("Database fetch error:", err.message);
      return res.status(500).json({ error: "Failed to fetch replies." });
    }
    res.status(200).json(results);
  });
});

// GET /api/files/:uuid endpoint to list files for a record
router.get("/files/:uuid", validateUUID, (req, res) => {
  const { uuid } = req.params;
  const query = `
    SELECT id, originalName AS fileName
    FROM file_uploads
    WHERE taccRecordId = ?
    ORDER BY uploaded_at DESC;
  `;
  db.query(query, [uuid], (err, results) => {
    if (err) {
      console.error("Error fetching files:", err.message);
      return res.status(500).json({ error: "Failed to fetch uploaded files." });
    }
    res.status(200).json(results);
  });
});


// NEW: GET /api/files/:uuid/:id endpoint to serve file contents
router.get("/files/:uuid/:id", validateUUID, async (req, res) => {
  const { uuid, id } = req.params;
  const query = `SELECT filePath, originalName FROM file_uploads WHERE taccRecordId = ? AND id = ?;`;
  try {
    const [rows] = await db.promise().query(query, [uuid, id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "File not found." });
    }
    const { filePath, originalName } = rows[0];
    // Use res.download to ensure the file is downloaded with the correct filename and extension.
    return res.download(path.resolve(filePath), originalName, (err) => {
      if (err) {
        console.error("Error downloading file:", err);
        res.status(500).end();
      }
    });
  } catch (err) {
    console.error("Error fetching file details:", err.message);
    res.status(500).json({ error: "Failed to fetch file." });
  }
});


// NEW: DELETE /api/files/:uuid/:id endpoint to delete a file record and file from disk
router.delete("/files/:uuid/:id", validateUUID, async (req, res) => {
  const { uuid, id } = req.params;
  // Get file details from database
  const selectQuery = `SELECT filePath FROM file_uploads WHERE taccRecordId = ? AND id = ?;`;
  try {
    const [rows] = await db.promise().query(selectQuery, [uuid, id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "File not found." });
    }
    const filePath = rows[0].filePath;
    // Delete file record from database
    const deleteQuery = `DELETE FROM file_uploads WHERE id = ?;`;
    await db.promise().query(deleteQuery, [id]);
    // Optionally delete file from disk
    fs.access(filePath, fs.constants.F_OK, async (err) => {
      if (!err) {
        try {
          await unlinkAsync(filePath);
          console.log(`File ${filePath} deleted from disk.`);
        } catch (unlinkErr) {
          console.error("Error deleting file from disk:", unlinkErr);
        }
      }
    });
    res.status(200).json({ message: "File deleted successfully." });
  } catch (err) {
    console.error("Error deleting file:", err.message);
    res.status(500).json({ error: "Failed to delete file." });
  }
});

// Serve static files if needed (e.g., for direct access)
// router.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// POST endpoint for legacy compatibility and /intercept/v2
function handleIntercept(req, res) {
  const { originUrl, interceptedData, privacyPolicyAccepted } = req.body;
  if (!privacyPolicyAccepted || privacyPolicyAccepted !== true) {
    return res.status(400).json({ error: "Privacy policy must be accepted." });
  }
  if (!originUrl || !interceptedData) {
    console.error("Invalid request body:", req.body);
    return res.status(400).json({ error: "Invalid request body." });
  }
  const sanitizedOriginUrl = sanitizeHtml(originUrl);
  const complaintSource = (req.body.where || "BBC").toUpperCase();
  const id = generateId();
  let title = "";
  let description = "";
  if (complaintSource === "IPSO") {
    if (!interceptedData.complaintDetails || !interceptedData.contactDetails) {
      return res.status(400).json({ error: "Missing required IPSO data." });
    }
    title = sanitizeHtml(interceptedData.complaintDetails.title || "");
    if (Array.isArray(interceptedData.complaintDetails.fields)) {
      description = interceptedData.complaintDetails.fields.map(s => sanitizeHtml(s)).join("\n");
    }
  } else {
    title = sanitizeHtml(interceptedData.title || "");
    description = sanitizeHtml(interceptedData.description || "");
  }
  let insertQuery = "";
  let values = [];
  if (complaintSource === "IPSO") {
    insertQuery = `
      INSERT INTO intercepted_data (
        id, source, originUrl, title, description,
        emailaddress, firstname, lastname, ipso_terms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const contact = interceptedData.contactDetails;
    values = [
      id,
      complaintSource,
      sanitizedOriginUrl,
      title,
      description,
      sanitizeHtml(contact.email_address || ""),
      sanitizeHtml(contact.first_name || ""),
      sanitizeHtml(contact.last_name || ""),
      contact["terms-and-conditions"] === true ? 1 : 0,
    ];
  } else {
    insertQuery = `
      INSERT INTO intercepted_data (
        id, source, originUrl, title, description,
        emailaddress, firstname, lastname, salutation, generalissue1,
        intro_text, iswelsh, liveorondemand, localradio, make,
        moderation_text, network, outside_the_uk, platform, programme,
        programmeid, reception_text, redbuttonfault, region, responserequired,
        servicetv, sounds_text, sourceurl, subject, transmissiondate,
        transmissiontime, under18, verifyform, complaint_nature, complaint_nature_sounds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    values = [
      id,
      complaintSource,
      sanitizedOriginUrl,
      sanitizeHtml(interceptedData.title || ""),
      sanitizeHtml(interceptedData.description || ""),
      sanitizeHtml(interceptedData.emailaddress || ""),
      sanitizeHtml(interceptedData.firstname || ""),
      sanitizeHtml(interceptedData.lastname || ""),
      sanitizeHtml(interceptedData.salutation || ""),
      sanitizeHtml(interceptedData.generalissue1 || ""),
      sanitizeHtml(interceptedData.intro_text || ""),
      sanitizeHtml(interceptedData.iswelsh || ""),
      sanitizeHtml(interceptedData.liveorondemand || ""),
      sanitizeHtml(interceptedData.localradio || ""),
      sanitizeHtml(interceptedData.make || ""),
      sanitizeHtml(interceptedData.moderation_text || ""),
      sanitizeHtml(interceptedData.network || ""),
      sanitizeHtml(interceptedData.outside_the_uk || ""),
      sanitizeHtml(interceptedData.platform || ""),
      sanitizeHtml(interceptedData.programme || ""),
      sanitizeHtml(interceptedData.programmeid || ""),
      sanitizeHtml(interceptedData.reception_text || ""),
      sanitizeHtml(interceptedData.redbuttonfault || ""),
      sanitizeHtml(interceptedData.region || ""),
      sanitizeHtml(interceptedData.responserequired || ""),
      sanitizeHtml(interceptedData.servicetv || ""),
      sanitizeHtml(interceptedData.sounds_text || ""),
      sanitizeHtml(interceptedData.sourceurl || ""),
      sanitizeHtml(interceptedData.subject || ""),
      sanitizeHtml(interceptedData.transmissiondate || ""),
      sanitizeHtml(interceptedData.transmissiontime || ""),
      sanitizeHtml(interceptedData.under18 || ""),
      sanitizeHtml(interceptedData.verifyform || ""),
      sanitizeHtml(interceptedData.complaint_nature || ""),
      sanitizeHtml(interceptedData.complaint_nature_sounds || "")
    ];
  }
  db.query(insertQuery, values, (err) => {
    if (err) {
      console.error("Database insertion error:", err.message, { query: insertQuery, values });
      return res.status(500).json({ error: "Failed to store data." });
    }
    if (complaintSource === "IPSO") {
      if (Array.isArray(interceptedData.complaintDetails.fields)) {
        interceptedData.complaintDetails.fields.forEach((fieldValue, index) => {
          const fieldInsert = `
            INSERT INTO ipso_complaint_fields (complaint_id, field_order, field_value)
            VALUES (?, ?, ?);
          `;
          db.query(fieldInsert, [id, index, sanitizeHtml(fieldValue)], (err) => {
            if (err) {
              console.error("Error inserting IPSO complaint field:", err.message);
            }
          });
        });
      }
      if (Array.isArray(interceptedData.codeBreaches)) {
        interceptedData.codeBreaches.forEach((breach) => {
          const clause = sanitizeHtml(breach.clause || "");
          const details = sanitizeHtml(breach.details || "");
          const breachInsert = `
            INSERT INTO ipso_code_breaches (complaint_id, clause, details)
            VALUES (?, ?, ?);
          `;
          db.query(breachInsert, [id, clause, details], (err) => {
            if (err) {
              console.error("Error inserting IPSO code breach:", err.message);
            }
          });
        });
      }
    }
    console.log("Data successfully inserted with ID:", id);
    res.status(200).json({ message: "Data stored successfully.", id });
  });
}

// Helper function to generate a UUID
function generateId() {
  const uuid = crypto.randomUUID();
  console.log("Generated UUID:", uuid);
  if (!uuid) {
    throw new Error("UUID generation failed");
  }
  return uuid;
}

// POST endpoint for legacy compatibility
router.post("/intercept", handleIntercept);
// New endpoint for IPSO/BBC compatibility
router.post("/intercept/v2", handleIntercept);

// GET endpoint for problematic articles
router.get("/problematic", (req, res) => {
  const fetchQuery = "SELECT * FROM problematic_article ORDER BY timestamp DESC;";
  db.query(fetchQuery, (err, results) => {
    if (err) {
      console.error("Database fetch error:", err.message);
      return res.status(500).json({ error: "Failed to fetch data." });
    }
    res.status(200).json(results);
  });
});

// POST endpoint to store replies
router.post("/replies", upload.any(), (req, res) => {
  const { bbc_ref_number, intercept_id, bbc_reply } = req.body;
  if (!intercept_id || !bbc_reply) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  const uuidV4Pattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  if (!uuidV4Pattern.test(intercept_id)) {
    return res.status(400).json({ error: "Invalid TACC Record ID format." });
  }
  const checkInterceptIdQuery = "SELECT id FROM intercepted_data WHERE id = ? LIMIT 1;";
  db.query(checkInterceptIdQuery, [intercept_id], (err, results) => {
    if (err) {
      console.error("Database error during intercept_id check:", err.message);
      return res.status(500).json({ error: "Internal server error." });
    }
    if (results.length === 0) {
      return res.status(400).json({ error: "Invalid intercept_id. No matching record found." });
    }
    const sanitizedReply = sanitizeHtml(bbc_reply);
    const insertReplyQuery = `
      INSERT INTO replies (bbc_ref_number, intercept_id, bbc_reply)
      VALUES (?, ?, ?);
    `;
    db.query(insertReplyQuery, [bbc_ref_number, intercept_id, sanitizedReply], (insertErr, insertResult) => {
      if (insertErr) {
        console.error("Error storing reply:", insertErr.message);
        return res.status(500).json({ error: "Failed to store reply.", details: insertErr.message });
      }
      res.status(200).json({ message: "Reply stored successfully.", id: insertResult.insertId });
    });
  });
});

// POST endpoint for file uploads with validations and database storage
router.post("/upload-files", upload.array("fileUpload[]", 5), async (req, res) => {
  try {
    const { taccRecordId, fileTitle } = req.body;
    const uuidV4Pattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!taccRecordId || !uuidV4Pattern.test(taccRecordId)) {
      return res.status(400).json({ error: "Invalid or missing TACC Record ID. Please provide a valid UUID v4." });
    }
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded." });
    }
    const maxFilesAllowed = 5;
    if (files.length > maxFilesAllowed) {
      return res.status(400).json({ error: `Maximum ${maxFilesAllowed} files allowed.` });
    }
    const insertFileQuery = `
      INSERT INTO file_uploads (taccRecordId, fileTitle, originalName, filename, filePath)
      VALUES (?, ?, ?, ?, ?);
    `;
    const fileInsertPromises = files.map(file => {
      return db.promise().query(insertFileQuery, [
        taccRecordId,
        fileTitle || null,
        file.originalname,
        file.filename,
        file.path
      ]);
    });
    await Promise.all(fileInsertPromises);
    res.status(200).json({
      message: "Files uploaded and stored successfully.",
      taccRecordId,
      fileTitle,
      files: files.map(file => ({
        id: file.id || 0, // Note: Depending on your DB insertion method, you might need to return the inserted file IDs.
        originalName: file.originalname,
        filename: file.filename,
        fileUrl: `/api/files/${taccRecordId}/${/* file.id */"REPLACEME"}` // Replace with actual file id from DB, if available.
      }))
    });
  } catch (error) {
    console.error("Error uploading files:", error);
    res.status(500).json({ error: "Failed to upload files" });
  }
});

module.exports = router;
