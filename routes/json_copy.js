const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Helper function to read data from file
const readData = (name) => {
    const filePath = path.join(DATA_DIR, name);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
};

// Helper function to write data to file
const writeData = (name, value) => {
    const filePath = path.join(DATA_DIR, name);
    fs.writeFileSync(filePath, value);
};

// Route to get data by filename
router.get('/data/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const data = readData(name);
        if (data !== null) {
            res.status(200).json({ message: 'Data found', data });
        } else {
            res.status(404).json({ error: 'Data not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve data' });
    }
});

// Route to set data
router.post('/data', async (req, res) => {
    try {
        const { name, value } = req.body;
        if (!name || !value) {
            return res.status(400).json({ error: 'Missing name or value' });
        }
        
        writeData(name, value);
        
        res.status(200).json({ message: 'Data saved successfully', data: { name, value } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

module.exports = router;
