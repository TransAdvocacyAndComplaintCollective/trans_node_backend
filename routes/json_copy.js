const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const xss = require('xss');

const router = express.Router();
const upload = multer(); // Set up multer for handling file uploads

// Define the data directory and ensure it exists
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

// Route to get data by filename
router.get('/data/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const sanitizedFilename = sanitizeFilename(name);
    const data = await readData(sanitizedFilename);
    if (data !== null) {
      try {
        // Try to parse the data as JSON
        const parsedData = JSON.parse(data);
        res.status(200).json({ message: 'Data found', data: parsedData });
      } catch (parseError) {
        // If parsing fails, return the raw string
        res.status(200).json({ message: 'Data found', data });
      }
    } else {
      res.status(404).json({ error: 'Data not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve data', details: error.message });
  }
});

// Route to set data with support for file uploads
// Added express.json() to properly handle JSON payloads from Google Sheets.
router.post('/data', express.json(), upload.single(FILE_UPLOAD_KEY), async (req, res) => {
  try {
    // Validate the API key
    if (req.body.apiKey !== EXPECTED_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    // Extract the "name" from the body
    const { name } = req.body;

    // If no name is provided, return an error.
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    const sanitizedFilename = sanitizeFilename(name);

    let value;
    // If a file is uploaded with the key defined by FILE_UPLOAD_KEY,
    // use its content as the value. Otherwise, use the "value" from the body.
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
    // Do not expose internal error details to the client
    res.status(500).json({ error: 'Failed to save data' });
  }
});

module.exports = router;
