const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const xss = require('xss');
const router = express.Router();
const upload = multer(); // Set up multer for handling file uploads
// check env variable to bypass captcha (it will be like a password)
const bypassCaptchaPassword = process.env.bypassCaptcha_password;
// It is assumed that cookie-parser middleware is in use in the main app.
// For example: app.use(require('cookie-parser')());

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdir(DATA_DIR, { recursive: true }).catch(console.error);

// Use environment variable FILE_UPLOAD_KEY to define the file field name (default: "file")
const FILE_UPLOAD_KEY = process.env.FILE_UPLOAD_KEY || 'file';
// Set up the expected API key (for example, from an environment variable)
const EXPECTED_API_KEY = process.env.API_KEY || 'mySecretApiKey';

// Helper function to sanitize filename
const sanitizeFilename = (name) => {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error('Invalid filename');
  }
  return name;
};

// Helper function to read data from a file
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

// Helper function to write data to a file (ensuring the value is a string)
const writeData = async (name, value) => {
  const fileName = sanitizeFilename(name);
  const filePath = path.join(DATA_DIR, fileName);

  // Convert value to a string if it's not already a string
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  await fs.writeFile(filePath, stringValue, 'utf8');
};

// Helper function to sanitize values (to help prevent stored XSS)
const sanitizeValue = (value) => {
  if (typeof value === 'string') {
    return xss(value);
  } else if (typeof value === 'object' && value !== null) {
    const sanitizedObj = {};
    for (const key in value) {
      if (typeof value[key] === 'string') {
        sanitizedObj[key] = xss(value[key]);
      } else {
        sanitizedObj[key] = value[key];
      }
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

// GET route to get data by filename, with CAPTCHA validation
router.get('/data/:name', checkSusCookie, async (req, res) => {
  try {
    // CAPTCHA validation:
    // Expect a query parameter "captcha" that should be a number.
    // In our simple scheme, an even number indicates a successful human check.
    const bypassCaptcha = req.query.bypassCaptchaPassword ===  bypassCaptchaPassword;
    const captcha = req.query.captcha;
    if (!captcha) {
      // No CAPTCHA provided – mark as suspicious.
      res.cookie('sus', 'true', { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
      return res.status(400).json({ error: 'Missing CAPTCHA token.' });
    }
    const captchaNum = parseInt(captcha, 10);
    if (isNaN(captchaNum) || (captchaNum % 2 !== 0)) {
      // Odd number or invalid: mark as suspicious.
      res.cookie('sus', 'true', { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
      return res.status(400).json({ error: 'Invalid CAPTCHA token.' });
    }
    // If we reached here, CAPTCHA validation passed.
    const { name } = req.params;
    const sanitizedFilename = sanitizeFilename(name);
    const data = await readData(sanitizedFilename);
    if (data !== null) {
      try {
        // Try to parse the data as JSON.
        const parsedData = JSON.parse(data);
        return res.status(200).json({ message: 'Data found', data: parsedData });
      } catch (parseError) {
        // If parsing fails, return the raw string.
        return res.status(200).json({ message: 'Data found', data });
      }
    } else {
      return res.status(404).json({ error: 'Data not found' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve data', details: error.message });
  }
});

// POST route to set data with support for file uploads (no CAPTCHA validation)
router.post('/data', express.json(), upload.single(FILE_UPLOAD_KEY), async (req, res) => {
  try {
    // Validate the API key.
    if (req.body.apiKey !== EXPECTED_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    // Extract the "name" from the body.
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    const sanitizedFilename = sanitizeFilename(name);

    let value;
    // If a file is uploaded with the key defined by FILE_UPLOAD_KEY, use its content as the value.
    if (req.file) {
      // Assuming the file is text-based, convert its buffer to a UTF-8 string.
      value = req.file.buffer.toString('utf8');
    } else {
      // If no file was provided, fall back to using req.body.value.
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

module.exports = router;
 