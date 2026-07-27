const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { requireAuth, requireRole } = require('../middleware/auth');

// Only admin and above can manage users
router.use(requireRole('admin'));

const getXbyY = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const getXbyYOne = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const setXbyY = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const VALID_ROLES = ['superadmin', 'admin', 'staff'];

// Roles an admin can assign (superadmin excluded unless the user is superadmin)
function getAssignableRoles(currentUserRole) {
    if (currentUserRole === 'superadmin') {
        return VALID_ROLES;
    }
    return ['admin', 'staff'];
}

// GET /dashboard/users - List all users
router.get('/', async (req, res) => {
    const db = req.db;
    const user = req.user;

    try {
        const settings = await getXbyY(db, `SELECT * FROM site_settings LIMIT 1`);
        const site = settings.length > 0 ? settings[0] : { brand_name: 'Temple Management' };

        const users = await getXbyY(db, `SELECT id, name, mobile, email, role, acc_lock, acc_ban, expiry, bharatpe_connected FROM users ORDER BY id ASC`);

        res.render('users', {
            site,
            user,
            userRole: (user.role || 'User').toLowerCase(),
            users,
            roles: getAssignableRoles((user.role || 'User').toLowerCase()),
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading users.');
    }
});

// POST /dashboard/users/create - Create a new user (admin+)
router.post('/create', async (req, res) => {
    const db = req.db;
    const currentUserRole = (req.user.role || 'User').toLowerCase();
    const { name, mobile, email, password, role } = req.body;

    try {
        if (!name || !mobile || !email || !password || !role) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('All fields are required.'));
        }

        if (!VALID_ROLES.includes(role)) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('Invalid role selected.'));
        }

        // Prevent admins from creating superadmin users
        const assignable = getAssignableRoles(currentUserRole);
        if (!assignable.includes(role)) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('You do not have permission to assign that role.'));
        }

        // Check if mobile already exists
        const existing = await getXbyY(db, `SELECT id FROM users WHERE mobile = ?`, [mobile]);
        if (existing.length > 0) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('Mobile number already exists.'));
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userToken = require('crypto').randomBytes(16).toString('hex');

        const result = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO users (name, mobile, email, password, role, user_token, acc_ban, acc_lock, aadhaar, pin, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [name.trim(), mobile.trim(), email.trim(), hashedPassword, role, userToken, 'off', 0, '000000000000', '0000', 'N/A'],
                function (err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });

        res.redirect('/dashboard/users?success=' + encodeURIComponent('User created successfully.'));
    } catch (err) {
        console.error('Create user error:', err);
        res.redirect('/dashboard/users?error=' + encodeURIComponent('Failed to create user.'));
    }
});

// POST /dashboard/users/update/:id - Update an existing user
router.post('/update/:id', async (req, res) => {
    const db = req.db;
    const { id } = req.params;
    const currentUserRole = (req.user.role || 'User').toLowerCase();
    const { name, mobile, email, role, password } = req.body;

    try {
        if (!name || !mobile || !email || !role) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('Name, mobile, email and role are required.'));
        }

        if (!VALID_ROLES.includes(role)) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('Invalid role selected.'));
        }

        // Prevent admins from promoting anyone to superadmin
        const assignable = getAssignableRoles(currentUserRole);
        if (!assignable.includes(role)) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('You do not have permission to assign that role.'));
        }

        // Check if mobile belongs to another user
        const existing = await getXbyY(db, `SELECT id FROM users WHERE mobile = ? AND id != ?`, [mobile, id]);
        if (existing.length > 0) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('Mobile number already used by another user.'));
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await setXbyY(db,
                `UPDATE users SET name = ?, mobile = ?, email = ?, role = ?, password = ? WHERE id = ?`,
                [name.trim(), mobile.trim(), email.trim(), role, hashedPassword, id]
            );
        } else {
            await setXbyY(db,
                `UPDATE users SET name = ?, mobile = ?, email = ?, role = ? WHERE id = ?`,
                [name.trim(), mobile.trim(), email.trim(), role, id]
            );
        }

        res.redirect('/dashboard/users?success=' + encodeURIComponent('User updated successfully.'));
    } catch (err) {
        console.error('Update user error:', err);
        res.redirect('/dashboard/users?error=' + encodeURIComponent('Failed to update user.'));
    }
});

// POST /dashboard/users/delete/:id - Delete a user (cannot delete self)
router.post('/delete/:id', async (req, res) => {
    const db = req.db;
    const { id } = req.params;
    const currentUserId = req.user.user_id;

    try {
        const targetUser = await getXbyYOne(db, `SELECT id, name FROM users WHERE id = ?`, [id]);

        if (!targetUser) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('User not found.'));
        }

        if (parseInt(id) === parseInt(currentUserId)) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('You cannot delete your own account.'));
        }

        await setXbyY(db, `DELETE FROM users WHERE id = ?`, [id]);
        res.redirect('/dashboard/users?success=' + encodeURIComponent('User deleted successfully.'));
    } catch (err) {
        console.error('Delete user error:', err);
        res.redirect('/dashboard/users?error=' + encodeURIComponent('Failed to delete user.'));
    }
});

// POST /dashboard/users/toggle-ban/:id - Toggle account ban
router.post('/toggle-ban/:id', async (req, res) => {
    const db = req.db;
    const { id } = req.params;

    try {
        const user = await getXbyYOne(db, `SELECT acc_ban FROM users WHERE id = ?`, [id]);
        if (!user) {
            return res.redirect('/dashboard/users?error=' + encodeURIComponent('User not found.'));
        }

        const newStatus = user.acc_ban === 'on' ? 'off' : 'on';
        await setXbyY(db, `UPDATE users SET acc_ban = ? WHERE id = ?`, [newStatus, id]);

        const msg = newStatus === 'on' ? 'User account locked.' : 'User account unlocked.';
        res.redirect('/dashboard/users?success=' + encodeURIComponent(msg));
    } catch (err) {
        console.error('Toggle ban error:', err);
        res.redirect('/dashboard/users?error=' + encodeURIComponent('Failed to update account status.'));
    }
});

// POST /dashboard/users/reset-lock/:id - Reset failed login counter
router.post('/reset-lock/:id', async (req, res) => {
    const db = req.db;
    const { id } = req.params;

    try {
        await setXbyY(db, `UPDATE users SET acc_lock = 0 WHERE id = ?`, [id]);
        res.redirect('/dashboard/users?success=' + encodeURIComponent('Login counter reset successfully.'));
    } catch (err) {
        console.error('Reset lock error:', err);
        res.redirect('/dashboard/users?error=' + encodeURIComponent('Failed to reset login counter.'));
    }
});

module.exports = router;
