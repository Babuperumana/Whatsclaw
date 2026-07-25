const express = require('express');
const router = express.Router();
const path = require('path');
const XLSX = require('xlsx');
const { requireAuth } = require('../middleware/auth');

// Helpers to wrap SQLite queries in Promises
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

router.use(requireAuth);

function buildDateFilter(params) {
    const { from_date, to_date, period } = params;
    if (from_date && to_date) {
        return { from: from_date, to: to_date, label: `${from_date} → ${to_date}` };
    }
    if (period) {
        const now = new Date();
        const to = now.toISOString().split('T')[0];
        let from;
        switch (period) {
            case 'today':
                from = to;
                break;
            case 'week':
                const d = new Date(now);
                d.setDate(d.getDate() - 6);
                from = d.toISOString().split('T')[0];
                break;
            case 'month':
                from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                break;
            case '30days':
                d = new Date(now);
                d.setDate(d.getDate() - 29);
                from = d.toISOString().split('T')[0];
                break;
            default:
                from = to;
        }
        const labels = { today: 'Today', week: 'Last 7 Days', month: 'This Month', '30days': 'Last 30 Days' };
        return { from, to, label: labels[period] || period };
    }
    // Default: last 30 days
    const now = new Date();
    const to = now.toISOString().split('T')[0];
    const from = new Date(now.getTime() - 29 * 86400000).toISOString().split('T')[0];
    return { from, to, label: 'Last 30 Days' };
}

async function fetchOrders(db, user_id, dateFilter) {
    let query = `SELECT * FROM orders WHERE user_id = ? AND date(create_date) >= ? AND date(create_date) <= ? ORDER BY create_date DESC`;
    let rows = await getXbyY(db, query, [user_id, dateFilter.from, dateFilter.to]);

    // Compute totals
    const totals = await getXbyYOne(db,
        `SELECT
            COUNT(*) as total_count,
            SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status='FAILURE' THEN 1 ELSE 0 END) as failure_count,
            SUM(CASE WHEN status='SUCCESS' THEN amount ELSE 0 END) as success_amount,
            SUM(CASE WHEN status='PENDING' THEN amount ELSE 0 END) as pending_amount,
            SUM(CASE WHEN status='FAILURE' THEN amount ELSE 0 END) as failure_amount,
            SUM(amount) as total_amount
        FROM orders WHERE user_id = ? AND date(create_date) >= ? AND date(create_date) <= ?`,
        [user_id, dateFilter.from, dateFilter.to]
    );

    return { rows, totals: totals || {} };
}

async function fetchVazhipadu(db, dateFilter) {
    let rows = await getXbyY(db,
        `SELECT * FROM vazhipadu_bookings WHERE date(created_at) >= ? AND date(created_at) <= ? ORDER BY created_at DESC`,
        [dateFilter.from, dateFilter.to]
    );
    const totals = await getXbyYOne(db,
        `SELECT
            COUNT(*) as total_count,
            SUM(CASE WHEN payment_mode='UPI' THEN 1 ELSE 0 END) as upi_count,
            SUM(CASE WHEN payment_mode='COUNTER' THEN 1 ELSE 0 END) as counter_count,
            SUM(amount) as total_amount,
            SUM(CASE WHEN status='CONFIRMED' THEN amount ELSE 0 END) as confirmed_amount,
            SUM(CASE WHEN status='PENDING' THEN amount ELSE 0 END) as pending_amount
        FROM vazhipadu_bookings WHERE date(created_at) >= ? AND date(created_at) <= ?`,
        [dateFilter.from, dateFilter.to]
    );
    return { rows, totals: totals || {} };
}

async function fetchDonations(db, dateFilter) {
    let rows = await getXbyY(db,
        `SELECT * FROM donations_payment_details WHERE date(created_at) >= ? AND date(created_at) <= ? ORDER BY created_at DESC`,
        [dateFilter.from, dateFilter.to]
    );
    const totals = await getXbyYOne(db,
        `SELECT
            COUNT(*) as total_count,
            SUM(CASE WHEN payment_mode='UPI' THEN 1 ELSE 0 END) as upi_count,
            SUM(CASE WHEN payment_mode='COUNTER' THEN 1 ELSE 0 END) as counter_count,
            SUM(amount) as total_amount,
            SUM(CASE WHEN status='CONFIRMED' THEN amount ELSE 0 END) as confirmed_amount,
            SUM(CASE WHEN status='PENDING' THEN amount ELSE 0 END) as pending_amount
        FROM donations_payment_details WHERE date(created_at) >= ? AND date(created_at) <= ?`,
        [dateFilter.from, dateFilter.to]
    );
    return { rows, totals: totals || {} };
}

function buildWorkbook(ordersData, vazhipaduData, donationsData, dateFilter) {
    const wb = XLSX.utils.book_new();

    // --- Orders Sheet ---
    const orderHeaders = ['Order ID', 'Amount (₹)', 'Payer Name', 'Payment App', 'Status', 'UTR', 'Create Date'];
    const orderRows = [
        ['--- TRANSACTIONS ---'],
        [`Period: ${dateFilter.label} (${dateFilter.from} to ${dateFilter.to})`, '', '', '', '', '', ''],
        [''],
        orderHeaders,
        ...ordersData.rows.map(o => [
            o.order_id,
            o.amount,
            o.payer_name || '',
            o.payer_handle || '',
            o.status || '',
            o.utr || '',
            o.create_date || ''
        ]),
        [''],
        ['--- SUMMARY ---', '', '', '', '', '', ''],
        ['Total Orders', ordersData.totals.total_count || 0, '', '', '', '', ''],
        ['SUCCESS', ordersData.totals.success_count || 0, '', '', '', '', ''],
        ['PENDING', ordersData.totals.pending_count || 0, '', '', '', '', ''],
        ['FAILURE', ordersData.totals.failure_count || 0, '', '', '', '', ''],
        ['SUCCESS Amount (₹)', ordersData.totals.success_amount || 0, '', '', '', '', ''],
        ['Total Amount (₹)', ordersData.totals.total_amount || 0, '', '', '', '', ''],
    ];
    const orderSheet = XLSX.utils.aoa_to_sheet(orderRows);
    orderSheet['!cols'] = [15, 12, 20, 15, 12, 15, 18];
    XLSX.utils.book_append_sheet(wb, orderSheet, 'Transactions');

    // --- Vazhipadu Sheet ---
    const vazhiHeaders = ['Order ID', 'Phone', 'Vazhipadu', 'Devotee', 'Nakshathram', 'Date', 'Amount (₹)', 'Mode', 'Status', 'Booked At'];
    const vazhiRows = [
        ['--- VAZHIPADU BOOKINGS ---'],
        [`Period: ${dateFilter.label}`, '', '', '', '', '', '', '', '', ''],
        [''],
        vazhiHeaders,
        ...vazhipaduData.rows.map(v => [
            v.order_id, v.phone_number, v.vazhipadu_name, v.devotee_name,
            v.nakshathram, v.performing_date, v.amount, v.payment_mode, v.status, v.created_at
        ]),
        [''],
        ['--- SUMMARY ---', '', '', '', '', '', '', '', '', ''],
        ['Total Bookings', vazhipaduData.totals.total_count || 0, '', '', '', '', '', '', '', ''],
        ['UPI Count', vazhipaduData.totals.upi_count || 0, '', '', '', '', '', '', '', ''],
        ['Counter Count', vazhipaduData.totals.counter_count || 0, '', '', '', '', '', '', '', ''],
        ['Total Amount (₹)', vazhipaduData.totals.total_amount || 0, '', '', '', '', '', '', '', ''],
        ['Confirmed Amount (₹)', vazhipaduData.totals.confirmed_amount || 0, '', '', '', '', '', '', '', ''],
    ];
    const vazhiSheet = XLSX.utils.aoa_to_sheet(vazhiRows);
    vazhiSheet['!cols'] = [15, 15, 25, 20, 18, 14, 12, 10, 12, 18];
    XLSX.utils.book_append_sheet(wb, vazhiSheet, 'Vazhipadu');

    // --- Donations Sheet ---
    const donHeaders = ['Order ID', 'Phone', 'WhatsApp Name', 'Amount (₹)', 'Mode', 'Status', 'Date', 'Purpose'];
    const donRows = [
        ['--- DONATIONS ---'],
        [`Period: ${dateFilter.label}`, '', '', '', '', '', '', ''],
        [''],
        donHeaders,
        ...donationsData.rows.map(d => [
            d.order_id, d.phone_number, d.whatsapp_name || '', d.amount,
            d.payment_mode, d.status, d.created_at, d.purpose || ''
        ]),
        [''],
        ['--- SUMMARY ---', '', '', '', '', '', '', ''],
        ['Total Donations', donationsData.totals.total_count || 0, '', '', '', '', '', ''],
        ['UPI Count', donationsData.totals.upi_count || 0, '', '', '', '', '', ''],
        ['Counter Count', donationsData.totals.counter_count || 0, '', '', '', '', '', ''],
        ['Total Amount (₹)', donationsData.totals.total_amount || 0, '', '', '', '', '', ''],
        ['Confirmed Amount (₹)', donationsData.totals.confirmed_amount || 0, '', '', '', '', '', ''],
    ];
    const donSheet = XLSX.utils.aoa_to_sheet(donRows);
    donSheet['!cols'] = [15, 15, 22, 12, 10, 12, 18, 25];
    XLSX.utils.book_append_sheet(wb, donSheet, 'Donations');

    // --- Grand Total Sheet ---
    const grandTotal = (ordersData.totals.total_amount || 0) + (vazhipaduData.totals.total_amount || 0) + (donationsData.totals.total_amount || 0);
    const grandRows = [
        ['--- GRAND TOTAL ---'],
        [`Period: ${dateFilter.label}`, ''],
        [''],
        ['Category', 'Count', 'Total Amount (₹)'],
        ['Transactions (SUCCESS)', ordersData.totals.success_count || 0, ordersData.totals.success_amount || 0],
        ['Vazhipadu', vazhipaduData.totals.total_count || 0, vazhipaduData.totals.total_amount || 0],
        ['Donations', donationsData.totals.total_count || 0, donationsData.totals.total_amount || 0],
        [''],
        ['GRAND TOTAL (₹)', '', grandTotal],
    ];
    const grandSheet = XLSX.utils.aoa_to_sheet(grandRows);
    grandSheet['!cols'] = [30, 15, 20];
    XLSX.utils.book_append_sheet(wb, grandSheet, 'Grand Total');

    return wb;
}

// GET /dashboard/transactions - Report page
router.get('/transactions', async (req, res) => {
    const db = req.db;
    const user = req.user;
    const { from_date, to_date, period } = req.query;

    try {
        const settings = await getXbyY(db, `SELECT * FROM site_settings LIMIT 1`);
        const site = settings.length > 0 ? settings[0] : { brand_name: 'Temple UPI' };

        const dateFilter = buildDateFilter({ from_date, to_date, period });
        const ordersData = await fetchOrders(db, user.user_id, dateFilter);
        const vazhipaduData = await fetchVazhipadu(db, dateFilter);
        const donationsData = await fetchDonations(db, dateFilter);

        res.render('reports', {
            site,
            user,
            dateFilter,
            orders: ordersData.rows,
            ordersTotals: ordersData.totals,
            vazhipadu: vazhipaduData.rows,
            vazhiTotals: vazhipaduData.totals,
            donations: donationsData.rows,
            donTotals: donationsData.totals
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading report.");
    }
});

// GET /dashboard/transactions.xlsx - Download as Excel
router.get('/transactions.xlsx', async (req, res) => {
    const db = req.db;
    const user = req.user;
    const { from_date, to_date, period } = req.query;

    try {
        const dateFilter = buildDateFilter({ from_date, to_date, period });
        const ordersData = await fetchOrders(db, user.user_id, dateFilter);
        const vazhipaduData = await fetchVazhipadu(db, dateFilter);
        const donationsData = await fetchDonations(db, dateFilter);

        const wb = buildWorkbook(ordersData, vazhipaduData, donationsData, dateFilter);

        const filename = `report_${dateFilter.from}_to_${dateFilter.to}.xlsx`;
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.send(buf);

    } catch (err) {
        console.error(err);
        res.status(500).send("Error generating report.");
    }
});

module.exports = router;
