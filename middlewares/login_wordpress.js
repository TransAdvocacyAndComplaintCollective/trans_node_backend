const axios = require('axios');


// Middleware to check if user is logged in
async function isUserLoggedIn(req, res, next) {
    try {
        const cookies = req.headers.cookie; // Get cookies from request headers
        const response = await axios.post(
            'https://your-wordpress-site.com/wp-admin/admin-ajax.php?action=check_user_logged_in',
            {},
            {
                headers: { Cookie: cookies }
            }
        );

        if (response.data.data.logged_in) {
            next(); // Proceed to the next middleware/route
        } else {
            res.status(401).json({ error: 'User not logged in' });
        }
    } catch (error) {
        console.error('Error verifying user authentication:', error);
        res.status(500).json({ error: 'Authentication check failed' });
    }
}
