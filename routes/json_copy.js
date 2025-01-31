const express = require('express');
const router = express.Router();

// Route to get data (only if user is logged in)
router.get('/data', isUserLoggedIn, async (req, res) => {
    try {
        // Simulate fetching data
        res.json({ message: 'Here is your data', data: { key: 'value' } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve data' });
    }
});

// Route to set data (only if user is logged in)
router.post('/data', isUserLoggedIn, async (req, res) => {
    try {
        const { key, value } = req.body;
        // Simulate saving data
        res.json({ message: 'Data saved successfully', data: { key, value } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

module.exports = router;
