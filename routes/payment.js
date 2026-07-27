const express = require('express');
const router = express.Router();
const crypto = require('crypto');

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

// GET /payment4/instant-pay/:token
router.get('/instant-pay/:token', async (req, res) => {
    try {
        const link_token = req.params.token;
        if (!link_token) {
            return res.status(400).send("Invalid request");
        }

        const db = req.db;

        // Fetch order_id & created_at from payment_links
        const links = await getXbyY(db, `SELECT order_id, created_at FROM payment_links WHERE link_token = ?`, [link_token]);
        if (links.length === 0) {
            return res.status(404).send("Token not found or expired");
        }

        const order_id = links[0].order_id;
        // Parse the DB string as UTC by appending 'Z' if it doesn't have it
        const dbDateStr = links[0].created_at.endsWith('Z') ? links[0].created_at : links[0].created_at.replace(' ', 'T') + 'Z';
        const created_at = new Date(dbDateStr).getTime();
        const current = Date.now();

        // Expire after 5 minutes
        if ((current - created_at) > 5 * 60 * 1000) {
            return res.status(400).send("Token has expired");
        }

        // Load order details
        const orders = await getXbyY(db, `SELECT * FROM orders WHERE order_id = ?`, [order_id]);
        if (orders.length === 0) {
            return res.status(404).send("Order not found");
        }

        const amount = orders[0].amount;
        const user_token = orders[0].user_token;
        const protocol = req.protocol;
        const host = req.get('host');
        const redirect_url = orders[0].redirect_url || `${protocol}://${host}/`;

        // Load UPI ID and customer name
        const bharatpe_tokens = await getXbyY(db, `SELECT Upiid FROM bharatpe_tokens WHERE user_token = ?`, [user_token]);
        const upi_id = bharatpe_tokens.length > 0 ? bharatpe_tokens[0].Upiid : 'Unknown@upi';

        const users = await getXbyY(db, `SELECT name FROM users WHERE user_token = ?`, [user_token]);
        const unitId = users.length > 0 ? users[0].name : 'Merchant';

        // Insert a session record
        const session_amount = amount;
        const pay_token = crypto.randomBytes(4).toString('hex');
        
        // SQLite expects YYYY-MM-DD HH:MM:SS
        const now = new Date();
        const create_timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
        
        const expireDate = new Date(now.getTime() + 5 * 60000);
        const expire_timestamp = expireDate.toISOString().replace('T', ' ').substring(0, 19);
        const status = 'PENDING';

        await setXbyY(db, `
            INSERT INTO bharatpe_session_information 
            (order_id, upi_id, amount, session_amount, pay_token, create_timestamp, expire_timestamp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [order_id, upi_id, amount, session_amount, pay_token, create_timestamp, expire_timestamp, status]);

        // Redirect the user immediately to pay0
        const payment_url = `${protocol}://${host}/payment4/pay0?pay_token=${encodeURIComponent(pay_token)}`;
        return res.redirect(payment_url);

    } catch (error) {
        console.error('Error in instant-pay:', error);
        return res.status(500).send("Internal Server Error");
    }
});

// GET /payment4/pay0
router.get('/pay0', async (req, res) => {
    try {
        const pay_token = req.query.pay_token;
        if (!pay_token) {
            return res.status(400).send("Invalid request");
        }

        const db = req.db;

        // Fetch session data
        const sessions = await getXbyY(db, `
            SELECT order_id, upi_id, amount AS base_amount, session_amount, create_timestamp, expire_timestamp, is_session_am_set
            FROM bharatpe_session_information 
            WHERE pay_token = ?
        `, [pay_token]);

        if (sessions.length === 0) {
            return res.status(404).send("Invalid token");
        }

        const session = sessions[0];
        let new_amount = session.session_amount;

        if (session.is_session_am_set === 'no') {
            const one_min_ago = new Date(Date.now() - 60000).toISOString().replace('T', ' ').substring(0, 19);
            let found = false;

            for (let i = 0; i < 100; i++) {
                const candidate = parseFloat((session.base_amount + 0.01 * i).toFixed(2));
                
                // check only pending sessions for this UPI
                const check = await getXbyY(db, `
                    SELECT 1 FROM bharatpe_session_information 
                    WHERE upi_id = ? AND status = 'PENDING' AND create_timestamp >= ? AND ABS(session_amount - ?) < 0.0001 LIMIT 1
                `, [session.upi_id, one_min_ago, candidate]);

                if (check.length === 0) {
                    new_amount = candidate;
                    found = true;
                    break;
                }
            }

            if (!found) {
                return res.status(400).send("All increments 0.00-0.99 for this UPI ID are in use; please try again shortly.");
            }

            // update session_amount and mark as set
            await setXbyY(db, `
                UPDATE bharatpe_session_information 
                SET session_amount = ?, is_session_am_set = 'yes' 
                WHERE pay_token = ?
            `, [new_amount, pay_token]);
        }

        // Compute seconds left until expire_timestamp
        const expire_dt = new Date(session.expire_timestamp).getTime();
        const now = Date.now();
        const secs = Math.max(0, Math.floor((expire_dt - now) / 1000));

        // Build UPI deep link & QR code URL
        const upi_deep_link = `upi://pay?pa=${encodeURIComponent(session.upi_id)}&am=${new_amount}&pn=${encodeURIComponent("Pay0")}&tn=${encodeURIComponent(session.order_id)}`;
        const qr_url = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upi_deep_link)}`;

        const orders = await getXbyY(db, `SELECT * FROM orders WHERE order_id = ?`, [session.order_id]);
        let redirect_url = orders.length > 0 && orders[0].redirect_url ? orders[0].redirect_url : `${req.protocol}://${req.get('host')}/`;

        // Render EJS view
        res.render('pay0', {
            new_amount: new_amount.toFixed(2),
            qr_url,
            upi_id: session.upi_id,
            secs,
            order_id: session.order_id,
            redirect_url
        });

    } catch (error) {
        console.error('Error in pay0:', error);
        return res.status(500).send("Internal Server Error");
    }
});

// POST /payment4/status.php
router.post('/status.php', async (req, res) => {
    try {
        const order_id = req.body.order_id;
        if (!order_id) {
            console.log('[status.php] Missing order_id');
            return res.status(400).json({ status: 'ERROR', message: 'Missing order_id' });
        }

        const db = req.db;

        // Fetch the payment session
        const sessions = await getXbyY(db, `
            SELECT pay_token, status, upi_id, session_amount, create_timestamp, expire_timestamp
            FROM bharatpe_session_information
            WHERE order_id = ? LIMIT 1
        `, [order_id]);

        if (sessions.length === 0) {
            console.log('[status.php] Session not found for order_id:', order_id);
            return res.status(404).json({ status: 'ERROR', message: 'Session not found' });
        }

        const session = sessions[0];
        console.log('[status.php] Session found, status:', session.status, 'order_id:', order_id);
        if (session.status !== 'PENDING') {
            return res.json({ status: session.status });
        }

        // Check expiration
        const now = Date.now();
        // Parse expire_timestamp correctly
        const expire_ts = new Date(session.expire_timestamp.endsWith('Z') ? session.expire_timestamp : session.expire_timestamp.replace(' ', 'T') + 'Z').getTime();

        if (expire_ts < now) {
            console.log('[status.php] Session expired, order_id:', order_id);
            await setXbyY(db, `UPDATE bharatpe_session_information SET status = 'FAILURE' WHERE pay_token = ?`, [session.pay_token]);
            return res.json({ status: 'FAILURE' });
        }

        // Fetch order meta
        const orders = await getXbyY(db, `SELECT user_token, user_id FROM orders WHERE order_id = ? LIMIT 1`, [order_id]);
        if (orders.length === 0) {
            console.log('[status.php] Order meta not found for order_id:', order_id);
            return res.status(404).json({ status: 'ERROR', message: 'Order meta not found' });
        }
        const user_token = orders[0].user_token;
        const user_id = orders[0].user_id;
        console.log('[status.php] Order meta: user_token:', user_token, 'user_id:', user_id);

        // Fetch BharatPe credentials
        const tokens = await getXbyY(db, `SELECT merchantId, token, cookie FROM bharatpe_tokens WHERE user_token = ? AND user_id = ? LIMIT 1`, [user_token, user_id]);
        if (tokens.length === 0) {
            console.log('[status.php] BharatPe credentials not found for user_token:', user_token);
            return res.status(404).json({ status: 'ERROR', message: 'Merchant credentials not found' });
        }
        const { merchantId, token: apiToken, cookie: apiCookie } = tokens[0];
        console.log('[status.php] BharatPe creds found: merchantId:', merchantId);

        // Call BharatPe transaction API
        const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
        const fromDate = twoDaysAgo.toISOString().split('T')[0];
        const toDate = new Date(now).toISOString().split('T')[0];

        const url = `https://payments-tesseract.bharatpe.in/api/v1/merchant/transactions?module=PAYMENT_QR&merchantId=${encodeURIComponent(merchantId)}&sDate=${encodeURIComponent(fromDate)}&eDate=${encodeURIComponent(toDate)}`;

        console.log('[status.php] Calling BharatPe API for order_id:', order_id, 'session_amount:', session.session_amount);
        const response = await fetch(url, {
            headers: {
                'token': apiToken,
                'Cookie': apiCookie,
                'User-Agent': 'NodeJS'
            }
        });

        console.log('[status.php] BharatPe API response status:', response.status, 'for order_id:', order_id);
        if (response.ok) {
            const apiData = await response.json();
            console.log('[status.php] BharatPe API data keys:', apiData.data ? Object.keys(apiData.data) : 'no data', 'tx count:', apiData.data && apiData.data.transactions ? apiData.data.transactions.length : 0);

            if (apiData.data && Array.isArray(apiData.data.transactions)) {
                const create_ts = new Date(session.create_timestamp.endsWith('Z') ? session.create_timestamp : session.create_timestamp.replace(' ', 'T') + 'Z').getTime();
                let bestMatch = null;
                let bestDelta = Infinity;
                for (const tx of apiData.data.transactions) {
                    if (tx.type === 'PAYMENT_RECV' && tx.status === 'SUCCESS') {
                        const amt = parseFloat(tx.amount);
                        const ms = parseInt(tx.paymentTimestamp);
                        if (Math.abs(amt - session.session_amount) < 0.0001) {
                            const delta = Math.abs(ms - create_ts);
                            if (delta < bestDelta) {
                                bestDelta = delta;
                                bestMatch = { amt, ms, tx };
                            }
                        }
                    }
                }

                if (bestMatch) {
                    console.log('[status.php] Amount match found. Delta from create_ts:', bestDelta, 'ms');
                    // Accept if within ±30 min of session create time (covers clock skew + late/early payments).
                    if (bestDelta < 30 * 60 * 1000) {
                        const { tx } = bestMatch;
                        const bankRef = tx.bankReferenceNo || '';
                        const payerName = tx.payerName || '';
                        const payerHandle = tx.payerHandle || '';

                        console.log('[status.php] MATCHED! Updating order to SUCCESS, order_id:', order_id);
                        await setXbyY(db, `UPDATE bharatpe_session_information SET status = 'SUCCESS', utr = ? WHERE pay_token = ?`, [bankRef, session.pay_token]);
                        await setXbyY(db, `UPDATE orders SET status = 'SUCCESS', amount = ?, utr = ?, payer_name = ?, payer_handle = ? WHERE order_id = ?`, [session.session_amount, bankRef, payerName, payerHandle, order_id]);
                        return res.json({ status: 'SUCCESS' });
                    } else {
                        console.log('[status.php] Amount matched but too far from create_ts (delta:', bestDelta, 'ms > 30 min). Skipping.');
                    }
                } else {
                    console.log('[status.php] No amount match for session_amount:', session.session_amount);
                }
            }
        } else {
            console.log('[status.php] BharatPe API returned non-OK:', response.status, response.statusText, 'for order_id:', order_id);
        }

        return res.json({ status: 'PENDING' });

    } catch (error) {
        console.error('[status.php] Error:', error);
        return res.status(500).json({ status: 'ERROR' });
    }
});

module.exports = router;
