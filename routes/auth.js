const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { redirectIfAuthenticated, JWT_SECRET } = require('../middleware/auth');

// Helper to wrap SQLite queries in Promises for async/await
const getXbyY = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const setXbyY = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

// GET /login - Render login page
router.get('/login', redirectIfAuthenticated, async (req, res) => {
    const db = req.db;
    try {
        const settings = await getXbyY(db, `SELECT * FROM site_settings LIMIT 1`);
        const site = settings.length > 0 ? settings[0] : { brand_name: 'Temple UPI', logo_url: '' };
        
        res.render('login', { site, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error rendering login page.");
    }
});

// POST /login - Handle authentication
router.post('/login', redirectIfAuthenticated, async (req, res) => {
    const db = req.db;
    const { username, password } = req.body; // 'username' here refers to mobile number

    try {
        const settings = await getXbyY(db, `SELECT * FROM site_settings LIMIT 1`);
        const site = settings.length > 0 ? settings[0] : { brand_name: 'Temple UPI', logo_url: '' };

        if (!username || !password) {
            return res.render('login', { site, error: 'Please enter mobile and password.' });
        }

        const users = await getXbyY(db, `SELECT * FROM users WHERE mobile = ?`, [username]);

        if (users.length > 0) {
            const user = users[0];

            if (user.acc_ban === 'on') {
                return res.render('login', { site, error: 'Account Locked! Please contact the administrator.' });
            }

            if (user.acc_lock >= 3) {
                return res.render('login', { site, error: 'Too many failed login attempts. Account Locked!' });
            }

            // Verify password
            const isMatch = await bcrypt.compare(password, user.password);

            if (isMatch) {
                // Reset lock counter
                await setXbyY(db, `UPDATE users SET acc_lock = 0 WHERE mobile = ?`, [username]);

                // Generate JWT token (store role as lowercase for consistent matching)
                const token = jwt.sign({
                    user_id: user.id,
                    mobile: user.mobile,
                    name: user.name,
                    role: (user.role || 'staff').toLowerCase()
                }, JWT_SECRET, { expiresIn: '1d' });

                // Set cookie
                res.cookie('jwt_token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 24 * 60 * 60 * 1000 // 1 day
                });

                return res.redirect('/dashboard');
            } else {
                // Increment lock
                const newLock = user.acc_lock + 1;
                await setXbyY(db, `UPDATE users SET acc_lock = ? WHERE mobile = ?`, [newLock, username]);
                return res.render('login', { site, error: 'Invalid Password! Please try again.' });
            }
        } else {
            return res.render('login', { site, error: 'Invalid Username! No account found with this mobile number.' });
        }

    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).send("Internal server error.");
    }
});

// GET /logout
router.get('/logout', (req, res) => {
    res.clearCookie('jwt_token');
    res.redirect('/login');
});

module.exports = router;
