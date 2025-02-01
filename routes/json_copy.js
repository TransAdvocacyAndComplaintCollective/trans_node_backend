const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdir(DATA_DIR, { recursive: true }).catch(console.error);

// Helper function to sanitize filename
const sanitizeFilename = (name) => {
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
        throw new Error('Invalid filename');
    }
    return name;
};

// Helper function to read data from file
const readData = async (name) => {
    name = sanitizeFilename(name);
    const filePath = path.join(DATA_DIR, name);
    try {
        await fs.access(filePath);
        return await fs.readFile(filePath, 'utf8');
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
};

// Helper function to write data to file (Fix: Ensure value is a string)
const writeData = async (name, value) => {
    name = sanitizeFilename(name);
    const filePath = path.join(DATA_DIR, name);

    // Convert value to a string if it's an object
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

    await fs.writeFile(filePath, stringValue, 'utf8');
};

// Route to get data by filename
router.get('/data/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const sanitized = sanitizeFilename(name);
        const data = await readData(sanitized);
        if (data !== null) {
            res.status(200).json({ message: 'Data found', data: JSON.parse(data) });
        } else {
            res.status(404).json({ error: 'Data not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve data', details: error.message });
    }
});

// Route to set data
router.post('/data', async (req, res) => {
    try {
        const { name, value } = req.body;
        if (!name || !value) {
            return res.status(400).json({ error: 'Missing name or value' });
        }
        const sanitized = sanitizeFilename(name);

        await writeData(sanitized, value);

        res.status(200).json({ message: 'Data saved successfully', data: { name: sanitized, value } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save data', details: error.message });
    }
});

module.exports = router;
