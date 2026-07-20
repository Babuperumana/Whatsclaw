const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// Nakshathram names (Malayalam) for the dropdown. Sourced from the panchangam
// engine when available, otherwise a static fallback so the page always renders.
let NAKSHATRAMS;
try {
    NAKSHATRAMS = require('../myassets/js/panchangam').getNakshatramList().map(n => n.ml);
} catch (e) {
    NAKSHATRAMS = ['അശ്വതി', 'ഭരണി', 'കാർത്തിക', 'രോഹിണി', 'മകയിരം', 'തിരുവാതിര', 'പുണർതം', 'പൂയം', 'ആയില്യം', 'മകം', 'പൂരം', 'ഉത്രം', 'അത്തം', 'ചിത്തിര', 'ചോതി', 'വിശാഖം', 'അനിഴം', 'തൃക്കേട്ട', 'മൂലം', 'പൂരാടം', 'ഉത്രാടം', 'തിരുവോണം', 'അവിട്ടം', 'ചതയം', 'പൂരുരുട്ടാതി', 'ഉത്രട്ടാതി', 'രേവതി'];
}

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

// Normalise a WhatsApp number to digits only (e.g. '918907959595').
const normNumber = (s) => String(s || '').replace(/[^0-9]/g, '');
const STATUSES = ['ACTIVE', 'INACTIVE'];

router.use(requireAuth);

// GET /dashboard/nakshathrapooja - List all nakshathra poojas
router.get('/', async (req, res) => {
    const db = req.db;
    const user = req.user;

    try {
        const settings = await queryAll(db, `SELECT * FROM site_settings LIMIT 1`);
        const site = settings.length > 0 ? settings[0] : { brand_name: 'Temple UPI' };

        const items = await queryAll(db, `SELECT * FROM nakshathra_pooja ORDER BY id ASC`);

        res.render('nakshathrapooja', {
            site,
            user,
            items,
            nakshatrams: NAKSHATRAMS,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Nakshathra Poojas.');
    }
});

// POST /dashboard/nakshathrapooja/create - Add a new nakshathra pooja
router.post('/create', async (req, res) => {
    const db = req.db;
    const { name, nakshathram, whatsapp_number, status } = req.body;

    try {
        const num = normNumber(whatsapp_number);
        if (!name || !name.trim() || !nakshathram || !nakshathram.trim() || !num) {
            return res.redirect('/dashboard/nakshathrapooja?error=' + encodeURIComponent('Name, nakshathram and WhatsApp number are required.'));
        }
        const st = STATUSES.includes(status) ? status : 'ACTIVE';

        await runQuery(
            db,
            `INSERT INTO nakshathra_pooja (name, nakshathram, whatsapp_number, status) VALUES (?, ?, ?, ?)`,
            [name.trim(), nakshathram.trim(), num, st]
        );

        res.redirect('/dashboard/nakshathrapooja?success=' + encodeURIComponent('Nakshathra pooja added successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard/nakshathrapooja?error=' + encodeURIComponent('Failed to add nakshathra pooja.'));
    }
});

// POST /dashboard/nakshathrapooja/update/:id - Update an existing entry
router.post('/update/:id', async (req, res) => {
    const db = req.db;
    const { id } = req.params;
    const { name, nakshathram, whatsapp_number, status } = req.body;

    try {
        const num = normNumber(whatsapp_number);
        if (!name || !name.trim() || !nakshathram || !nakshathram.trim() || !num) {
            return res.redirect('/dashboard/nakshathrapooja?error=' + encodeURIComponent('Name, nakshathram and WhatsApp number are required.'));
        }
        const st = STATUSES.includes(status) ? status : 'ACTIVE';

        await runQuery(
            db,
            `UPDATE nakshathra_pooja SET name = ?, nakshathram = ?, whatsapp_number = ?, status = ? WHERE id = ?`,
            [name.trim(), nakshathram.trim(), num, st, id]
        );

        res.redirect('/dashboard/nakshathrapooja?success=' + encodeURIComponent('Nakshathra pooja updated successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard/nakshathrapooja?error=' + encodeURIComponent('Failed to update nakshathra pooja.'));
    }
});

// POST /dashboard/nakshathrapooja/delete/:id - Delete an entry
router.post('/delete/:id', async (req, res) => {
    const db = req.db;
    const { id } = req.params;

    try {
        await runQuery(db, `DELETE FROM nakshathra_pooja WHERE id = ?`, [id]);
        res.redirect('/dashboard/nakshathrapooja?success=' + encodeURIComponent('Nakshathra pooja deleted successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard/nakshathrapooja?error=' + encodeURIComponent('Failed to delete nakshathra pooja.'));
    }
});

module.exports = router;
