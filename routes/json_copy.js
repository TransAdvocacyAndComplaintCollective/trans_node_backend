const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const xss = require('xss');
const nodemailer = require('nodemailer');
const mysql = require("mysql2");
const crypto = require('crypto');
const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise').v1;
const recaptchaenterpriseClient = new RecaptchaEnterpriseServiceClient();
const router = express.Router();
const upload = multer();

// Directories for real and fake data
const DATA_DIR = path.join(__dirname, 'data');
const FAKE_DATA_DIR = path.join(__dirname, 'fake_data');
fs.mkdir(DATA_DIR, { recursive: true }).catch(console.error);
fs.mkdir(FAKE_DATA_DIR, { recursive: true }).catch(console.error);

const FILE_UPLOAD_KEY = process.env.FILE_UPLOAD_KEY || 'file';
const EXPECTED_API_KEY = process.env.API_KEY || 'mySecretApiKey';
const expectedBypassPassword = process.env.bypassCaptcha_password;
const EXPECTED_RECAPTCHA_KEY = process.env.RECAPTCHA_KEY || 'myRecaptchaKey';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'my-project';

const emailPassword = process.env.EMAIL_PASSWORD || 'your_email_password';
const emailUserName = process.env.EMAIL_USERNAME || 'your_email_username';
const emailHost = process.env.EMAIL_HOST || 'smtp.example.com';
const emailPort = process.env.EMAIL_PORT || 587;
const emailSecure = process.env.EMAIL_SECURE == "true" || false; // true for 465, false for other ports

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "your_mysql_username",
  password: process.env.DB_PASSWORD || "your_mysql_password",
  database: process.env.DB_NAME || "intercepted_data_db",
  port: process.env.DB_PORT || 3306,
  connectionLimit: 10,
});

const EmailConfigOptions = {
  host: emailHost,
  port: emailPort,
  secure: emailSecure, // true for 465, false for other ports
  auth: {
    user: emailUserName,
    pass: emailPassword,
  },
  tls: {
    rejectUnauthorized: false,
  },
};


// Helper function to sanitize filenames
const sanitizeFilename = (name) => {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error('Invalid filename');
  }
  return name;
};

// Read/write functions for real data
const readData = async (name) => {
  const fileName = sanitizeFilename(name);
  const filePath = path.join(DATA_DIR, fileName);
  try {
    await fs.access(filePath);
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
};

const writeData = async (name, value) => {
  const fileName = sanitizeFilename(name);
  const filePath = path.join(DATA_DIR, fileName);
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  await fs.writeFile(filePath, stringValue, 'utf8');
};

// Read/write functions for fake data
const readFakeData = async (name) => {
  const fileName = sanitizeFilename(name);
  const filePath = path.join(FAKE_DATA_DIR, fileName);
  try {
    await fs.access(filePath);
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading fake file ${filePath}:`, error);
    return null;
  }
};

const writeFakeData = async (name, value) => {
  const fileName = sanitizeFilename(name);
  const filePath = path.join(FAKE_DATA_DIR, fileName);
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  await fs.writeFile(filePath, stringValue, 'utf8');
};

// Sanitize values to help prevent stored XSS
const sanitizeValue = (value) => {
  if (typeof value === 'string') {
    return xss(value);
  } else if (typeof value === 'object' && value !== null) {
    const sanitizedObj = {};
    for (const key in value) {
      sanitizedObj[key] = typeof value[key] === 'string' ? xss(value[key]) : value[key];
    }
    return sanitizedObj;
  }
  return value;
};

// Middleware to check for suspicious activity using cookies
function checkSusCookie(req, res, next) {
  if (req.cookies && req.cookies.sus === 'true') {
    return res.status(403).json({ error: 'Access blocked due to suspicious activity.' });
  }
  next();
}
// setup SQL db to keep track of access tokens. all access tokens should be unique and time limited.
function setupDatabase() {
  db.query(`
    CREATE TABLE IF NOT EXISTS access_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL,
      status ENUM('active', 'used') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (error, results) => {
    if (error) {
      console.error('Error creating table:', error);
    } else {
      console.log('Table created or already exists');
    }
  });
  console.log('Database setup complete');
  // sweep old tokens every 24 hours
  setInterval(() => {
    db.query(`
      DELETE FROM access_tokens WHERE created_at < NOW() - INTERVAL 1 DAY
    `, (error, results) => {
      if (error) {
        console.error('Error deleting old tokens:', error);
      } else {
        console.log('Old tokens deleted');
      }
    });
  }
    , 24 * 60 * 60 * 1000); // every 24 hours
}
setupDatabase();


// POST route to ask for Access Token what will be sent by email
router.post('/ask_for_access_token', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  // Generate a unique access token
  const token = crypto.randomBytes(16).toString('hex');
  // Store the token in the database with status 'active'
  db.query('INSERT INTO access_tokens (token, email) VALUES (?, ?)', [token, email], (error, results) => {
    if (error) {
      console.error('Error inserting token:', error);
      return res.status(500).json({ error: 'Failed to store access token' });
    }
    // Send the token
    nodemailer.createTransport(EmailConfigOptions).sendMail({
    }).catch((error) => {
      console.error('Error sending email:', error);
      return res.status(500).json({ error: 'Failed to send email' });
    }
    ).then(() => {
      console.log('Email sent successfully');
      res.status(200).json({ message: 'Access token sent to email' });
    });
    // Send the email with the token
  });
});



// GET route (changed to POST) to retrieve data by filename with CAPTCHA validation.
// If real data is not found, it will try to return fake data (if available).
// Updated GET route (changed to POST) to retrieve data by filename with CAPTCHA and access token validation.
// If real data is not found, it will try to return fake data (if available).
router.post('/data/:name', checkSusCookie, async (req, res) => {
  // Access token check
  const accessToken = req.body.accessToken;
  if (!accessToken) {
    return res.status(400).json({ error: 'Access token is required' });
  }
  
  try {
    // Use the promise-based query from mysql2 to check the access token
    const [rows] = await db.promise().query(
      'SELECT * FROM access_tokens WHERE token = ? AND status = "active"',
      [accessToken]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired access token' });
    }
  } catch (error) {
    console.error('Error during access token verification:', error);
    return res.status(500).json({ error: 'Database error during access token verification' });
  }
  
  // CAPTCHA and randomValue check as before
  const providedBypass = req.body.bypassCaptcha_password;
  const tokenToValidate = req.body.recaptchaToken || req.body.g_recaptcha_response;
  const randomValue = req.body.randomValue || req.query.randomValue;
  if (randomValue) {
    // if randomValue is even, allow access
    if (randomValue % 2 !== 0) {
      return res.status(403).json({ error: 'Access blocked due to suspicious activity.' });
    }
  } else {
    return res.status(400).json({ error: 'Missing randomValue' });
  }
  if (providedBypass !== expectedBypassPassword) {
    if (!tokenToValidate) {
      return res.status(400).json({ error: 'CAPTCHA token is required' });
    }
    const requestPayload = {
      parent: `projects/${PROJECT_ID}`,
      assessment: {
        event: {
          token: tokenToValidate,
          siteKey: EXPECTED_RECAPTCHA_KEY,
        },
      },
    };
    try {
      const [response] = await recaptchaenterpriseClient.createAssessment(requestPayload);
      const { valid, action, score } = response.tokenProperties;
      const expectedAction = 'submit'; // Update if necessary
      if (!valid) {
        return res.status(400).json({ error: 'Invalid CAPTCHA response' });
      }
      if (action !== expectedAction) {
        return res.status(400).json({ error: 'CAPTCHA action mismatch' });
      }
      if (score < 0.5) {
        res.cookie('sus', 'true', { maxAge: 900000, httpOnly: true });
        return res.status(403).json({ error: 'Access blocked due to suspicious activity.' });
      }
      console.log('CAPTCHA token validated:', tokenToValidate);
      console.log('CAPTCHA action:', action);
      console.log('CAPTCHA score:', score);
    } catch (captchaError) {
      console.error('Error during CAPTCHA validation:', captchaError);
      return res.status(500).json({ error: 'CAPTCHA validation failed' });
    }
  }

  try {
    const { name } = req.params;
    const sanitizedFilename = sanitizeFilename(name);
    const data = await readData(sanitizedFilename);
    if (data !== null) {
      try {
        const parsedData = JSON.parse(data);
        return res.status(200).json({ message: 'Data found', data: parsedData });
      } catch (parseError) {
        return res.status(200).json({ message: 'Data found', data });
      }
    } else {
      // If real data is not found, attempt to read fake data.
      const fakeData = await readFakeData(sanitizedFilename);
      if (fakeData !== null) {
        try {
          const parsedFakeData = JSON.parse(fakeData);
          return res.status(200).json({ message: 'Fake data found', data: parsedFakeData });
        } catch (parseError) {
          return res.status(200).json({ message: 'Fake data found', data: fakeData });
        }
      } else {
        return res.status(404).json({ error: 'Data not found' });
      }
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve data', details: error.message });
  }
});



// POST route to save real data
router.post('/data', express.json(), upload.single(FILE_UPLOAD_KEY), async (req, res) => {
  try {
    if (req.body.apiKey !== EXPECTED_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    const sanitizedFilename = sanitizeFilename(name);
    let value;
    if (req.file) {
      value = req.file.buffer.toString('utf8');
    } else {
      if (req.body.value == null) {
        return res.status(400).json({ error: 'Missing value or file upload' });
      }
      value = sanitizeValue(req.body.value);
    }
    await writeData(sanitizedFilename, value);
    res.status(200).json({
      message: 'Data saved successfully',
      data: { name: sanitizedFilename, value },
    });
  } catch (error) {
    console.error('Error in POST /data:', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// POST route to save fake data in a separate folder
router.post('/fake_data', express.json(), upload.single(FILE_UPLOAD_KEY), async (req, res) => {
  try {
    if (req.body.apiKey !== EXPECTED_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    const sanitizedFilename = sanitizeFilename(name);
    let value;
    if (req.file) {
      value = req.file.buffer.toString('utf8');
    } else {
      if (req.body.value == null) {
        return res.status(400).json({ error: 'Missing value or file upload' });
      }
      value = sanitizeValue(req.body.value);
    }
    await writeFakeData(sanitizedFilename, value);
    res.status(200).json({
      message: 'Fake data saved successfully',
      data: { name: sanitizedFilename, value },
    });
  } catch (error) {
    console.error('Error in POST /fake_data:', error);
    res.status(500).json({ error: 'Failed to save fake data' });
  }
});

module.exports = router;
