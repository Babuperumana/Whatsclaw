const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

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

// Validate a 'YYYY-MM-DD' date string.
const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime());

router.use(requireAuth);

// GET /dashboard/specialdays - List all special days
router.get('/', async (req, res) => {
    const db = req.db;
    const user = req.user;

    try {
        const settings = await queryAll(db, `SELECT * FROM site_settings LIMIT 1`);
        const site = settings.length > 0 ? settings[0] : { brand_name: 'Temple UPI' };

        const items = await queryAll(db, `SELECT * FROM special_days ORDER BY event_date ASC`);

        res.render('specialdays', {
            site,
            user,
            items,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Special Days.');
    }
});

// POST /dashboard/specialdays/create - Add a new special day
router.post('/create', async (req, res) => {
    const db = req.db;
    const { event_date, name } = req.body;

    try {
        if (!name || !name.trim() || !event_date) {
            return res.redirect('/dashboard/specialdays?error=' + encodeURIComponent('Date and name are required.'));
        }
        if (!isValidDate(event_date)) {
            return res.redirect('/dashboard/specialdays?error=' + encodeURIComponent('Date must be a valid YYYY-MM-DD date.'));
        }

        await runQuery(
            db,
            `INSERT INTO special_days (event_date, name) VALUES (?, ?)`,
            [event_date, name.trim()]
        );

        res.redirect('/dashboard/specialdays?success=' + encodeURIComponent('Special day added successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard/specialdays?error=' + encodeURIComponent('Failed to add special day.'));
    }
});

// POST /dashboard/specialdays/update/:id - Update an existing special day
router.post('/update/:id', async (req, res) => {
    const db = req.db;
    const { id } = req.params;
    const { event_date, name } = req.body;

    try {
        if (!name || !name.trim() || !event_date) {
            return res.redirect('/dashboard/specialdays?error=' + encodeURIComponent('Date and name are required.'));
        }
        if (!isValidDate(event_date)) {
            return res.redirect('/dashboard/specialdays?error=' + encodeURIComponent('Date must be a valid YYYY-MM-DD date.'));
        }

        await runQuery(
            db,
            `UPDATE special_days SET event_date = ?, name = ? WHERE id = ?`,
            [event_date, name.trim(), id]
        );

        res.redirect('/dashboard/specialdays?success=' + encodeURIComponent('Special day updated successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard/specialdays?error=' + encodeURIComponent('Failed to update special day.'));
    }
});

// POST /dashboard/specialdays/delete/:id - Delete a special day
router.post('/delete/:id', async (req, res) => {
    const db = req.db;
    const { id } = req.params;

    try {
        await runQuery(db, `DELETE FROM special_days WHERE id = ?`, [id]);
        res.redirect('/dashboard/specialdays?success=' + encodeURIComponent('Special day deleted successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard/specialdays?error=' + encodeURIComponent('Failed to delete special day.'));
    }
});

module.exports = router;
