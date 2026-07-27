const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

// Helper to run SELECT queries as a Promise
const queryAll = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// Helper to run INSERT/UPDATE/DELETE queries as a Promise
const runQuery = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const canEdit = requireRole('admin');

// GET /dashboard/vazhipadu - List all vazhipadu items (readable by admin & staff)
router.get('/', requireAuth, async (req, res) => {
    const db = req.db;
    const user = req.user;

    try {
        const settings = await queryAll(db, `SELECT * FROM site_settings LIMIT 1`);
        const site = settings.length > 0 ? settings[0] : { brand_name: 'Temple Management' };

        const items = await queryAll(db, `SELECT * FROM vazhipadu_master ORDER BY id ASC`);

        res.render('vazhipadu', {
            site,
            user,
            userRole: (user.role || 'User').toLowerCase(),
            items,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Vazhipadu master.');
    }
});

// POST /dashboard/vazhipadu/create - Add new vazhipadu item (admin+ only)
router.post('/create', canEdit, async (req, res) => {
    const db = req.db;
    const { name, price, ageing } = req.body;

    try {
        if (!name || price === undefined || price === '') {
            return res.redirect('/dashboard/vazhipadu?error=' + encodeURIComponent('Name and price are required.'));
        }

        const priceVal = parseFloat(price);
        const ageingVal = parseInt(ageing);

        if (isNaN(priceVal) || priceVal < 0) {
            return res.redirect('/dashboard/vazhipadu?error=' + encodeURIComponent('Price must be a valid non-negative number.'));
        }

        await runQuery(
            db,
            `INSERT INTO vazhipadu_master (name, price, ageing) VALUES (?, ?, ?)`,
            [name.trim(), priceVal, isNaN(ageingVal) ? 0 : ageingVal]
        );

        res.redirect('/dashboard/vazhipadu?success=' + encodeURIComponent('Vazhipadu item added successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard/vazhipadu?error=' + encodeURIComponent('Failed to add item.'));
    }
});

// POST /dashboard/vazhipadu/update/:id - Update an existing item (admin+ only)
router.post('/update/:id', canEdit, async (req, res) => {
    const db = req.db;
    const { id } = req.params;
    const { name, price, ageing } = req.body;

    try {
        if (!name || price === undefined || price === '') {
            return res.redirect('/dashboard/vazhipadu?error=' + encodeURIComponent('Name and price are required.'));
        }

        const priceVal = parseFloat(price);
        const ageingVal = parseInt(ageing);

        if (isNaN(priceVal) || priceVal < 0) {
            return res.redirect('/dashboard/vazhipadu?error=' + encodeURIComponent('Price must be a valid non-negative number.'));
        }

        await runQuery(
            db,
            `UPDATE vazhipadu_master SET name = ?, price = ?, ageing = ? WHERE id = ?`,
            [name.trim(), priceVal, isNaN(ageingVal) ? 0 : ageingVal, id]
        );

        res.redirect('/dashboard/vazhipadu?success=' + encodeURIComponent('Vazhipadu item updated successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard/vazhipadu?error=' + encodeURIComponent('Failed to update item.'));
    }
});

// POST /dashboard/vazhipadu/delete/:id - Delete an item (admin+ only)
router.post('/delete/:id', canEdit, async (req, res) => {
    const db = req.db;
    const { id } = req.params;

    try {
        await runQuery(db, `DELETE FROM vazhipadu_master WHERE id = ?`, [id]);
        res.redirect('/dashboard/vazhipadu?success=' + encodeURIComponent('Vazhipadu item deleted successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard/vazhipadu?error=' + encodeURIComponent('Failed to delete item.'));
    }
});

module.exports = router;
