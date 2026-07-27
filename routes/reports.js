const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendWhatsAppMessage, ADMIN_NOTIFY_JID } = require('../whatsappBot');

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

const setXbyY = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

function hasCRUDPermission(userRole, action) {
    const role = (userRole || 'User').toLowerCase();
    if (role === 'superadmin') return true;
    if (role === 'admin' && action !== 'delete') return true;
    if (role === 'staff' && (action === 'create' || action === 'read')) return true;
    return false;
}

function canCreate(role) { return hasCRUDPermission(role, 'create'); }
function canEdit(role) { return hasCRUDPermission(role, 'update'); }
function canDelete(role) { return hasCRUDPermission(role, 'delete'); }

router.use(requireAuth);

function buildDateFilter(params) {
    const { from_date, to_date, period } = params;
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
    if (from_date && to_date) {
        return { from: from_date, to: to_date, label: `${from_date} → ${to_date}` };
    }
    const now = new Date();
    const to = now.toISOString().split('T')[0];
    const from = new Date(now.getTime() - 29 * 86400000).toISOString().split('T')[0];
    return { from, to, label: 'Last 30 Days' };
}

function csvEscape(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

async function fetchOrders(db, user_id, dateFilter) {
    let rows = await getXbyY(db,
        `SELECT * FROM orders WHERE user_id = ? AND date(create_date) >= ? AND date(create_date) <= ? ORDER BY create_date DESC`,
        [user_id, dateFilter.from, dateFilter.to]
    );
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

function buildCSV(ordersData, vazhipaduData, donationsData, dateFilter) {
    const lines = [];

    lines.push('=== TRANSACTIONS ===');
    lines.push(`Period: ${dateFilter.label} (${dateFilter.from} to ${dateFilter.to})`);
    lines.push('');
    lines.push('Order ID,Amount (Rs),Payer Name,Payment App,Status,UTR,Create Date');
    ordersData.rows.forEach(o => {
        lines.push([
            csvEscape(o.order_id),
            csvEscape(o.amount),
            csvEscape(o.payer_name),
            csvEscape(o.payer_handle),
            csvEscape(o.status),
            csvEscape(o.utr),
            csvEscape(o.create_date)
        ].join(','));
    });
    lines.push('');
    lines.push('--- SUMMARY ---');
    lines.push(`Total Orders,${ordersData.totals.total_count || 0}`);
    lines.push(`SUCCESS,${ordersData.totals.success_count || 0}`);
    lines.push(`PENDING,${ordersData.totals.pending_count || 0}`);
    lines.push(`FAILURE,${ordersData.totals.failure_count || 0}`);
    lines.push(`SUCCESS Amount (Rs),${ordersData.totals.success_amount || 0}`);
    lines.push(`Total Amount (Rs),${ordersData.totals.total_amount || 0}`);
    lines.push('');

    lines.push('=== VAZHIPADU BOOKINGS ===');
    lines.push(`Period: ${dateFilter.label}`);
    lines.push('');
    lines.push('Order ID,Phone,Vazhipadu,Devotee,Nakshathram,Date,Amount (Rs),Mode,Status,Booked At');
    vazhipaduData.rows.forEach(v => {
        lines.push([
            csvEscape(v.order_id), csvEscape(v.phone_number), csvEscape(v.vazhipadu_name),
            csvEscape(v.devotee_name), csvEscape(v.nakshathram), csvEscape(v.performing_date),
            csvEscape(v.amount), csvEscape(v.payment_mode), csvEscape(v.status), csvEscape(v.created_at)
        ].join(','));
    });
    lines.push('');
    lines.push('--- SUMMARY ---');
    lines.push(`Total Bookings,${vazhipaduData.totals.total_count || 0}`);
    lines.push(`UPI Count,${vazhipaduData.totals.upi_count || 0}`);
    lines.push(`Counter Count,${vazhipaduData.totals.counter_count || 0}`);
    lines.push(`Total Amount (Rs),${vazhipaduData.totals.total_amount || 0}`);
    lines.push(`Confirmed Amount (Rs),${vazhipaduData.totals.confirmed_amount || 0}`);
    lines.push('');

    lines.push('=== DONATIONS ===');
    lines.push(`Period: ${dateFilter.label}`);
    lines.push('');
    lines.push('Order ID,Phone,WhatsApp Name,Amount (Rs),Mode,Status,Date,Purpose');
    donationsData.rows.forEach(d => {
        lines.push([
            csvEscape(d.order_id), csvEscape(d.phone_number), csvEscape(d.whatsapp_name || ''),
            csvEscape(d.amount), csvEscape(d.payment_mode), csvEscape(d.status),
            csvEscape(d.created_at), csvEscape(d.purpose || '')
        ].join(','));
    });
    lines.push('');
    lines.push('--- SUMMARY ---');
    lines.push(`Total Donations,${donationsData.totals.total_count || 0}`);
    lines.push(`UPI Count,${donationsData.totals.upi_count || 0}`);
    lines.push(`Counter Count,${donationsData.totals.counter_count || 0}`);
    lines.push(`Total Amount (Rs),${donationsData.totals.total_amount || 0}`);
    lines.push(`Confirmed Amount (Rs),${donationsData.totals.confirmed_amount || 0}`);
    lines.push('');

    const grandTotal = ordersData.totals.success_amount || 0;
    lines.push('=== GRAND TOTAL ===');
    lines.push(`Period: ${dateFilter.label}`);
    lines.push('');
    lines.push('Category,Count,Total Amount (Rs)');
    lines.push(`Transactions (SUCCESS),${ordersData.totals.success_count || 0},${ordersData.totals.success_amount || 0}`);
    lines.push(`Vazhipadu (incl. in orders),${vazhipaduData.totals.total_count || 0},—`);
    lines.push(`Donations (incl. in orders),${donationsData.totals.total_count || 0},—`);
    lines.push('');
    lines.push(`GRAND TOTAL (Rs),,${grandTotal}`);

    return lines.join('\n');
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
            userRole: (user.role || 'User').toLowerCase(),
            dateFilter,
            from_date: req.query.from_date || null,
            to_date: req.query.to_date || null,
            period: req.query.period || null,
            orders: ordersData.rows,
            ordersTotals: ordersData.totals,
            vazhipadu: vazhipaduData.rows,
            vazhiTotals: vazhipaduData.totals,
            donations: donationsData.rows,
            donTotals: donationsData.totals
        });

    } catch (err) {
        console.error('[reports] Error loading report:', err);
        res.status(500).send("Error loading report.");
    }
});

// GET /dashboard/transactions.xlsx - Download as CSV
router.get('/transactions.xlsx', async (req, res) => {
    const db = req.db;
    const user = req.user;
    const { from_date, to_date, period } = req.query;

    try {
        const dateFilter = buildDateFilter({ from_date, to_date, period });
        const ordersData = await fetchOrders(db, user.user_id, dateFilter);
        const vazhipaduData = await fetchVazhipadu(db, dateFilter);
        const donationsData = await fetchDonations(db, dateFilter);

        const csv = buildCSV(ordersData, vazhipaduData, donationsData, dateFilter);

        const filename = `report_${dateFilter.from}_to_${dateFilter.to}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.send(csv);

    } catch (err) {
        console.error('[reports] Error generating CSV:', err);
        res.status(500).send("Error generating report.");
    }
});

// ── CRUD Routes ───────────────────────────────────────────────────────────────

// Helper: enforce CRUD permissions
function enforcePermission(userRole, action) {
    if (!hasCRUDPermission(userRole, action)) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
}

// POST /dashboard/transactions/order/create - Create a manual order
router.post('/transactions/order/create', async (req, res) => {
    const db = req.db;
    const user = req.user;
    const userRole = (user.role || 'User').toLowerCase();

    try {
        enforcePermission(userRole, 'create');
        const { order_id, amount, payer_name, payer_handle, status, utr } = req.body;
        if (!order_id || !amount) {
            return res.redirect('back');
        }
        const validStatus = ['SUCCESS', 'PENDING', 'FAILURE'];
        const finalStatus = validStatus.includes(status) ? status : 'PENDING';
        await setXbyY(db,
            `INSERT INTO orders (order_id, amount, payer_name, payer_handle, status, utr, create_date, user_id) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
            [order_id, amount, payer_name || null, payer_handle || null, finalStatus, utr || null, user.user_id]
        );
        res.redirect('back');
    } catch (err) {
        console.error('[reports] Create order error:', err);
        res.redirect('back');
    }
});

// POST /dashboard/transactions/order/update/:id
router.post('/transactions/order/update/:id', async (req, res) => {
    const db = req.db;
    const user = req.user;

    try {
        enforcePermission((user.role || 'User').toLowerCase(), 'update');
        const { amount, payer_name, payer_handle, status, utr } = req.body;
        const oldRow = await getXbyYOne(db, `SELECT * FROM orders WHERE id = ?`, [req.params.id]);
        await setXbyY(db,
            `UPDATE orders SET amount = ?, payer_name = ?, payer_handle = ?, status = ?, utr = ? WHERE id = ?`,
            [amount, payer_name || null, payer_handle || null, status, utr || null, req.params.id]
        );
        if (oldRow && (user.role || '').toLowerCase() !== 'staff') {
            notifyAdminOfEdit({
                editorName: user.name || user.mobile,
                entityType: 'order',
                action: 'Update',
                recordId: oldRow.order_id || req.params.id,
                oldRow,
                newRow: { ...oldRow, amount, payer_name, payer_handle, status, utr }
            });
        }
        res.redirect('back');
    } catch (err) {
        console.error('[reports] Update order error:', err);
        res.redirect('back');
    }
});

// POST /dashboard/transactions/order/delete/:id
router.post('/transactions/order/delete/:id', async (req, res) => {
    const db = req.db;
    const user = req.user;

    try {
        enforcePermission((user.role || 'User').toLowerCase(), 'delete');
        await setXbyY(db, `DELETE FROM orders WHERE id = ?`, [req.params.id]);
        res.redirect('back');
    } catch (err) {
        console.error('[reports] Delete order error:', err);
        res.redirect('back');
    }
});

// POST /dashboard/transactions/vazhipadu/create
router.post('/transactions/vazhipadu/create', async (req, res) => {
    const db = req.db;
    const user = req.user;

    try {
        enforcePermission((user.role || 'User').toLowerCase(), 'create');
        const { order_id, phone_number, vazhipadu_name, devotee_name, nakshathram, performing_date, amount, payment_mode, status } = req.body;
        if (!order_id || !amount) {
            return res.redirect('back');
        }
        await setXbyY(db,
            `INSERT INTO vazhipadu_bookings (order_id, phone_number, vazhipadu_name, devotee_name, nakshathram, performing_date, amount, payment_mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [order_id, phone_number || '', vazhipadu_name || '', devotee_name || '', nakshathram || '', performing_date || '', amount, payment_mode || 'COUNTER', status || 'PENDING']
        );
        res.redirect('back');
    } catch (err) {
        console.error('[reports] Create vazhipadu error:', err);
        res.redirect('back');
    }
});

// POST /dashboard/transactions/vazhipadu/update/:id
router.post('/transactions/vazhipadu/update/:id', async (req, res) => {
    const db = req.db;

    try {
        enforcePermission((req.user.role || 'User').toLowerCase(), 'update');
        const { vazhipadu_name, devotee_name, nakshathram, performing_date, amount, payment_mode, status } = req.body;
        const oldRow = await getXbyYOne(db, `SELECT * FROM vazhipadu_bookings WHERE id = ?`, [req.params.id]);
        await setXbyY(db,
            `UPDATE vazhipadu_bookings SET vazhipadu_name = ?, devotee_name = ?, nakshathram = ?, performing_date = ?, amount = ?, payment_mode = ?, status = ? WHERE id = ?`,
            [vazhipadu_name, devotee_name, nakshathram, performing_date, amount, payment_mode, status, req.params.id]
        );
        if (oldRow) {
            notifyAdminOfEdit({
                editorName: req.user.name || req.user.mobile,
                entityType: 'vazhipadu',
                action: 'Update',
                recordId: oldRow.order_id || req.params.id,
                oldRow,
                newRow: { ...oldRow, vazhipadu_name, devotee_name, nakshathram, performing_date, amount, payment_mode, status }
            });
        }
        res.redirect('back');
    } catch (err) {
        console.error('[reports] Update vazhipadu error:', err);
        res.redirect('back');
    }
});

// POST /dashboard/transactions/vazhipadu/delete/:id
router.post('/transactions/vazhipadu/delete/:id', async (req, res) => {
    const db = req.db;

    try {
        enforcePermission((req.user.role || 'User').toLowerCase(), 'delete');
        await setXbyY(db, `DELETE FROM vazhipadu_bookings WHERE id = ?`, [req.params.id]);
        res.redirect('back');
    } catch (err) {
        console.error('[reports] Delete vazhipadu error:', err);
        res.redirect('back');
    }
});

// POST /dashboard/transactions/donation/create
router.post('/transactions/donation/create', async (req, res) => {
    const db = req.db;
    const user = req.user;

    try {
        enforcePermission((user.role || 'User').toLowerCase(), 'create');
        const { order_id, phone_number, amount, payment_mode, status, whatsapp_name, purpose } = req.body;
        if (!order_id || !amount) {
            return res.redirect('back');
        }
        await setXbyY(db,
            `INSERT INTO donations_payment_details (order_id, phone_number, amount, payment_mode, status, whatsapp_name, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [order_id, phone_number || '', amount, payment_mode || 'COUNTER', status || 'PENDING', whatsapp_name || null, purpose || null]
        );
        res.redirect('back');
    } catch (err) {
        console.error('[reports] Create donation error:', err);
        res.redirect('back');
    }
});

// POST /dashboard/transactions/donation/update/:id
router.post('/transactions/donation/update/:id', async (req, res) => {
    const db = req.db;

    try {
        enforcePermission((req.user.role || 'User').toLowerCase(), 'update');
        const { amount, payment_mode, status, whatsapp_name, purpose } = req.body;
        const oldRow = await getXbyYOne(db, `SELECT * FROM donations_payment_details WHERE id = ?`, [req.params.id]);
        await setXbyY(db,
            `UPDATE donations_payment_details SET amount = ?, payment_mode = ?, status = ?, whatsapp_name = ?, purpose = ? WHERE id = ?`,
            [amount, payment_mode, status, whatsapp_name || null, purpose || null, req.params.id]
        );
        if (oldRow) {
            notifyAdminOfEdit({
                editorName: req.user.name || req.user.mobile,
                entityType: 'donation',
                action: 'Update',
                recordId: oldRow.order_id || req.params.id,
                oldRow,
                newRow: { ...oldRow, amount, payment_mode, status, whatsapp_name, purpose }
            });
        }
        res.redirect('back');
    } catch (err) {
        console.error('[reports] Update donation error:', err);
        res.redirect('back');
    }
});

// POST /dashboard/transactions/donation/delete/:id
router.post('/transactions/donation/delete/:id', async (req, res) => {
    const db = req.db;

    try {
        enforcePermission((req.user.role || 'User').toLowerCase(), 'delete');
        await setXbyY(db, `DELETE FROM donations_payment_details WHERE id = ?`, [req.params.id]);
        res.redirect('back');
    } catch (err) {
        console.error('[reports] Delete donation error:', err);
        res.redirect('back');
    }
});

// Send a Malayalam WhatsApp notification to the admin group when an admin edits a row.
// Fire-and-forget: never blocks or fails the CRUD response.
function notifyAdminOfEdit({ editorName, entityType, action, recordId, oldRow, newRow }) {
    if (!ADMIN_NOTIFY_JID) return;
    const fields = Object.keys(newRow || {});
    const changes = fields.map(f => {
        const o = oldRow ? (oldRow[f] === null || oldRow[f] === undefined ? '-' : oldRow[f]) : '-';
        const n = newRow[f] === null || newRow[f] === undefined ? '-' : newRow[f];
        if (String(o) === String(n)) return null;
        return `   • ${f}: ${o}  →  ${n}`;
    }).filter(Boolean).join('\n');

    const entityLabel = {
        order: 'ഇടപാട് (Transaction)',
        vazhipadu: 'വഴിപാട് (Vazhipadu)',
        donation: 'ദാനം (Donation)'
    }[entityType] || entityType;

    const text =
        `🔔 *ഡാഷ്ബോർഡ് എഡിറ്റ് അറിയിപ്പ്*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `👤 എഡിറ്റ് ചെയ്തത്: *${editorName}*\n` +
        `📂 വിഭാഗം: *${entityLabel}*\n` +
        `🛠 പ്രവർത്തനം: *${action}*\n` +
        `🆔 റെക്കോർഡ് നമ്പർ: ${recordId}\n` +
        `━━━━━━━━━━━━━━━\n` +
        (changes ? `📝 *മാറ്റങ്ങൾ:*\n${changes}\n` : 'ℹ️ മാറ്റങ്ങളൊന്നും കാണുന്നില്ല.\n') +
        `━━━━━━━━━━━━━━━\n` +
        `🕐 സമയം: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

    sendWhatsAppMessage(ADMIN_NOTIFY_JID, { type: 'text', text })
        .catch(err => console.error('[reports] WhatsApp notify failed:', err.message));
}

module.exports = router;
