const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// Helper to wrap SQLite queries in Promises
const getXbyY = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

router.use(requireAuth);

// GET /dashboard
router.get('/', async (req, res) => {
    const db = req.db;
    const user = req.user;

    try {
        const settings = await getXbyY(db, `SELECT * FROM site_settings LIMIT 1`);
        const site = settings.length > 0 ? settings[0] : { brand_name: 'Temple Management' };

        // Fetch dashboard statistics
        const today = new Date().toISOString().split('T')[0];

        // Today's total success amount
        const successRows = await getXbyY(db, `SELECT IFNULL(SUM(amount), 0) as total FROM orders WHERE status = 'SUCCESS' AND user_id = ? AND date(create_date) = ?`, [user.user_id, today]);
        const todaySuccessAmt = successRows[0].total;

        // Today's success count
        const successCountRows = await getXbyY(db, `SELECT COUNT(*) as count FROM orders WHERE status = 'SUCCESS' AND user_id = ? AND date(create_date) = ?`, [user.user_id, today]);
        const todaySuccessCount = successCountRows[0].count;

        // Pending count today
        const pendingCountRows = await getXbyY(db, `SELECT COUNT(*) as count FROM orders WHERE status = 'PENDING' AND user_id = ? AND date(create_date) = ?`, [user.user_id, today]);
        const todayPendingCount = pendingCountRows[0].count;

        // Failure count today
        const failureCountRows = await getXbyY(db, `SELECT COUNT(*) as count FROM orders WHERE status = 'FAILURE' AND user_id = ? AND date(create_date) = ?`, [user.user_id, today]);
        const todayFailureCount = failureCountRows[0].count;

        // Total successful amount all time
        const allSuccessRows = await getXbyY(db, `SELECT IFNULL(SUM(amount), 0) as total FROM orders WHERE status = 'SUCCESS' AND user_id = ?`, [user.user_id]);
        const totalSuccessAmt = allSuccessRows[0].total;

        // Recent orders (last 10)
        const recentOrders = await getXbyY(db, `SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 10`, [user.user_id]);

        // Recent Vazhipadu Bookings (all users - shared temple data)
        const recentVazhipadu = await getXbyY(db, `SELECT * FROM vazhipadu_bookings ORDER BY id DESC LIMIT 10`);

        // Recent Donations (all users - shared temple data)
        const recentDonations = await getXbyY(db, `SELECT * FROM donations_payment_details ORDER BY id DESC LIMIT 10`);

        res.render('dashboard', {
            site,
            user,
            userRole: (user.role || 'User').toLowerCase(),
            stats: {
                todaySuccessAmt,
                todaySuccessCount,
                todayPendingCount,
                todayFailureCount,
                totalSuccessAmt
            },
            recentOrders,
            recentVazhipadu,
            recentDonations
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading dashboard.");
    }
});

module.exports = router;
