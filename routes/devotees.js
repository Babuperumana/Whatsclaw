const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

// Helpers
const queryAll = (db, query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});
const runQuery = (db, query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function (err) { if (err) reject(err); else resolve(this); });
});

const VALID_LANGUAGES = ['Malayalam', 'English', 'Tamil', 'Hindi'];

// GET /dashboard/devotees — viewable by all authenticated users
router.get('/', requireAuth, async (req, res) => {
    const db = req.db;
    try {
        const settings = await queryAll(db, `SELECT * FROM site_settings LIMIT 1`);
        const site = settings.length > 0 ? settings[0] : { brand_name: 'Temple Management' };
        const devotees = await queryAll(db, `SELECT * FROM devotees ORDER BY id DESC`);
        res.render('devotees', {
            site,
            user: req.user,
            userRole: (req.user.role || 'User').toLowerCase(),
            devotees,
            languages: VALID_LANGUAGES,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading devotees.');
    }
});

// CRUD actions — staff can add/edit; delete is admin+ only
const requireStaff = requireRole('staff');
const requireAdmin = requireRole('admin');

// POST /dashboard/devotees/create
router.post('/create', requireStaff, async (req, res) => {
    const db = req.db;
    const { phone_number, whatsapp_name, language } = req.body;
    try {
        if (!phone_number || !phone_number.trim()) {
            return res.redirect('/dashboard/devotees?error=' + encodeURIComponent('Phone number is required.'));
        }
        const cleanPhone = phone_number.trim().replace(/\s+/g, '');
        const cleanName = whatsapp_name ? whatsapp_name.trim() : '';
        const cleanLang = language && VALID_LANGUAGES.includes(language) ? language : null;

        await runQuery(
            db,
            `INSERT INTO devotees (phone_number, whatsapp_name, language) VALUES (?, ?, ?)`,
            [cleanPhone, cleanName || null, cleanLang]
        );
        res.redirect('/dashboard/devotees?success=' + encodeURIComponent('Devotee added successfully.'));
    } catch (err) {
        console.error('Create devotee error:', err);
        if (err.message.includes('UNIQUE constraint')) {
            res.redirect('/dashboard/devotees?error=' + encodeURIComponent('Phone number already exists.'));
        } else {
            res.redirect('/dashboard/devotees?error=' + encodeURIComponent('Failed to add devotee.'));
        }
    }
});

// POST /dashboard/devotees/update/:id
router.post('/update/:id', requireStaff, async (req, res) => {
    const db = req.db;
    const { id } = req.params;
    const { phone_number, whatsapp_name, language } = req.body;
    try {
        if (!phone_number || !phone_number.trim()) {
            return res.redirect('/dashboard/devotees?error=' + encodeURIComponent('Phone number is required.'));
        }
        const cleanPhone = phone_number.trim().replace(/\s+/g, '');
        const cleanName = whatsapp_name ? whatsapp_name.trim() : '';
        const cleanLang = language && VALID_LANGUAGES.includes(language) ? language : null;

        const existing = await queryAll(db, `SELECT id FROM devotees WHERE phone_number = ? AND id != ?`, [cleanPhone, id]);
        if (existing.length > 0) {
            return res.redirect('/dashboard/devotees?error=' + encodeURIComponent('Phone number already used by another devotee.'));
        }

        await runQuery(
            db,
            `UPDATE devotees SET phone_number = ?, whatsapp_name = ?, language = ? WHERE id = ?`,
            [cleanPhone, cleanName || null, cleanLang, id]
        );
        res.redirect('/dashboard/devotees?success=' + encodeURIComponent('Devotee updated successfully.'));
    } catch (err) {
        console.error('Update devotee error:', err);
        res.redirect('/dashboard/devotees?error=' + encodeURIComponent('Failed to update devotee.'));
    }
});

// POST /dashboard/devotees/delete/:id
router.post('/delete/:id', requireAdmin, async (req, res) => {
    const db = req.db;
    const { id } = req.params;
    try {
        await runQuery(db, `DELETE FROM devotees WHERE id = ?`, [id]);
        res.redirect('/dashboard/devotees?success=' + encodeURIComponent('Devotee deleted successfully.'));
    } catch (err) {
        console.error('Delete devotee error:', err);
        res.redirect('/dashboard/devotees?error=' + encodeURIComponent('Failed to delete devotee.'));
    }
});

module.exports = router;
