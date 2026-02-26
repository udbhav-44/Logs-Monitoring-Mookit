const ldapService = require('../services/ldapService');
const jwt = require('jsonwebtoken');

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Please provide username and password' });
    }

    try {
        const user = await ldapService.authenticate(username, password);

        if (user) {
            const token = jwt.sign(
                { id: user.uid, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                _id: user.uid,
                username: user.uid,
                name: user.name,
                email: user.email,
                token
            });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server Authentication Error' });
    }
};
const refresh = async (req, res) => {
    // We expect the token in the body for an explicit refresh, or we can use protect middleware.
    // Let's use the explicit body token to allow handling expired tokens within a grace period.
    const { token } = req.body;
    if (!token) return res.status(401).json({ message: 'No token provided' });

    try {
        // verify ignoring expiration so we can check if it's recently expired
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });

        // Don't refresh if it's older than 7 days since expiration
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && (now - decoded.exp > 7 * 24 * 60 * 60)) {
            return res.status(401).json({ message: 'Token too old to refresh' });
        }

        const newToken = jwt.sign(
            { id: decoded.id || decoded.uid, username: decoded.username },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token: newToken });
    } catch (error) {
        console.error('Refresh Error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
};

module.exports = { login, refresh };
