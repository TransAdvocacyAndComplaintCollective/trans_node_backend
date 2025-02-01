const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { isUserLoggedIn } = require('../middlewares/login_wordpress');
const router = express.Router();

const DATA_FILE = path.join(__dirname, '../data.json');

// Function to read data from file
const readData = async () => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {}; // Return empty object if file does not exist or is empty
    }
};

// Function to write data to file
const writeData = async (data) => {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        throw new Error('Failed to write data to file');
    }
};

// Route to get data
router.get('/data', async (req, res) => {
    try {
        const data = await readData();
        res.json({ message: 'Here is your data', data });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve data' });
    }
});

// Route to set data
router.post('/data', async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || !value) {
            return res.status(400).json({ error: 'Both key and value are required' });
        }
        
        let data = await readData();
        data[key] = value; // Update data object
        await writeData(data);
        
        res.json({ message: 'Data saved successfully', data });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

module.exports = router;