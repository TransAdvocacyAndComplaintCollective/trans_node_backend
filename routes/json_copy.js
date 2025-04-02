const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const xss = require('xss');
const {RecaptchaEnterpriseServiceClient} = require('@google-cloud/recaptcha-enterprise').v1;
const recaptchaenterpriseClient = new RecaptchaEnterpriseServiceClient();
const router = express.Router();
const upload = multer(); // Set up multer for handling file uploads

// It is assumed that cookie-parser middleware is in use in the main app.
// For example: app.use(require('cookie-parser')());

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdir(DATA_DIR, { recursive: true }).catch(console.error);

// Use environment variable FILE_UPLOAD_KEY to define the file field name (default: "file")
const FILE_UPLOAD_KEY = process.env.FILE_UPLOAD_KEY || 'file';
// Set up the expected API key (for example, from an environment variable)
const EXPECTED_API_KEY = process.env.API_KEY || 'mySecretApiKey';
// Expected bypass password (from environment) to skip CAPTCHA validation
const expectedBypassPassword = process.env.bypassCaptcha_password;
// Expected reCAPTCHA key (site key)
const EXPECTED_RECAPTCHA_KEY = process.env.RECAPTCHA_KEY || 'myRecaptchaKey';
// Your Google Cloud project ID (replace with your actual project ID)
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'my-project';

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

// GET route to get data by filename, with CAPTCHA validation
router.post('/data/:name', checkSusCookie, async (req, res) => {  // Changed from GET to POST
  // Extract fields from the request body
  const providedBypass = req.body.bypassCaptcha_password;
  // Prefer recaptchaToken if provided, otherwise fallback to g_recaptcha_response
  const tokenToValidate = req.body.recaptchaToken || req.body.g_recaptcha_response;

  // If no bypass password is provided, validate the CAPTCHA token.
  if (providedBypass !== expectedBypassPassword) {
    if (!tokenToValidate) {
      return res.status(400).json({ error: 'CAPTCHA token is required' });
    }
    // Build the reCAPTCHA Enterprise assessment request
    const request = {
      parent: `projects/${PROJECT_ID}`,
      assessment: {
        event: {
          token: tokenToValidate,
          siteKey: EXPECTED_RECAPTCHA_KEY,
        },
      },
    };
    try {
      const [response] = await recaptchaenterpriseClient.createAssessment(request);
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
      return res.status(404).json({ error: 'Data not found' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve data', details: error.message });
  }
});


// POST route to set data with support for file uploads (no CAPTCHA validation)
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

module.exports = router;
