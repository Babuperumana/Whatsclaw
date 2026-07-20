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

// Generate unique link token (Ported from generateUniqueToken)
const generateUniqueToken = () => {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const token = Date.now().toString() + randomHex + Math.floor(Math.random() * 50 + 1).toString();
    return crypto.createHash('sha256').update(token).digest('hex');
};

// POST /api/create-order
router.post('/create-order', async (req, res) => {
    try {
        const { customer_mobile, user_token, amount, order_id, redirect_url, remark1, remark2 } = req.body;

        if (!customer_mobile || !user_token || !amount || !order_id) {
            return res.status(400).json({ status: false, message: "Missing required parameters" });
        }

        const db = req.db;
        const byteorderid = "BYTE" + Math.floor(Math.random() * 9000 + 1111) + Date.now();

        // 1. Get user details
        const users = await getXbyY(db, `SELECT * FROM users WHERE user_token = ?`, [user_token]);
        if (users.length === 0) {
            return res.status(400).json({ status: false, message: "Invalid user token" });
        }

        const user = users[0];
        const bydb_unq_user_id = user.id;
        const bydb_order_bharatpe_conn = user.bharatpe_connected;
        const expire_date = user.expiry;

        // 2. Check if order_id already exists for this user_token
        const existingOrder = await getXbyY(db, `SELECT * FROM orders WHERE order_id = ? AND user_token = ?`, [order_id, user_token]);
        if (existingOrder.length > 0) {
            return res.status(400).json({ status: false, message: "Order ID already exists for this user" });
        }

        if (bydb_order_bharatpe_conn === "Yes") {
            const today = new Date().toISOString().split('T')[0];
            // Compare dates simply (assuming YYYY-MM-DD format in DB)
            if (new Date(expire_date) >= new Date(today)) {
                // Generate link_token
                const link_token = generateUniqueToken();
                const payzerotoday = new Date().toISOString().replace('T', ' ').substring(0, 19);

                // Insert into payment_links
                await setXbyY(db, `INSERT INTO payment_links (link_token, order_id, created_at) VALUES (?, ?, ?)`, 
                    [link_token, order_id, payzerotoday]);

                // Construct payment link
                const protocol = req.protocol;
                const host = req.get('host');
                const payment_link = `${protocol}://${host}/payment4/instant-pay/${link_token}`;

                const gateway_txn = crypto.randomUUID().substring(0, 13);
                
                // Insert into orders
                await setXbyY(db, `
                    INSERT INTO orders 
                    (gateway_txn, amount, order_id, status, user_token, utr, customer_mobile, redirect_url, method, byteTransactionId, create_date, remark1, remark2, user_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [gateway_txn, amount, order_id, 'PENDING', user_token, '', customer_mobile, redirect_url, 'Bharatpe', byteorderid, payzerotoday, remark1, remark2, bydb_unq_user_id]);

                return res.status(201).json({
                    status: true,
                    message: "Order Created Successfully",
                    result: {
                        orderId: order_id,
                        payment_url: payment_link
                    }
                });

            } else {
                return res.status(400).json({ status: false, message: "Your Plan Expired Please Renew" });
            }
        } else {
            return res.status(400).json({ status: false, message: "Merchant Not Linked" });
        }

    } catch (error) {
        console.error('Error in create-order API:', error);
        return res.status(500).json({ status: false, message: "Internal Server Error" });
    }
});

// POST /api/check-order
router.post('/check-order', async (req, res) => {
    try {
        const { user_token, order_id } = req.body;

        if (!user_token || !order_id) {
            return res.status(400).json({ status: false, message: "Missing required parameter" });
        }

        const db = req.db;

        // Check user token validity and ban/lock status
        const users = await getXbyY(db, `SELECT acc_ban, acc_lock, expiry FROM users WHERE user_token = ?`, [user_token]);
        
        if (users.length === 0) {
            return res.status(401).json({ status: false, message: "Unauthorized access" });
        }

        const user = users[0];
        
        if (user.acc_ban === "on") {
            return res.status(403).json({ status: false, message: "Your Account is Banned" });
        }

        if (parseInt(user.acc_lock) >= 3) {
            return res.status(403).json({ status: false, message: "Your Account is Locked" });
        }

        // Fetch order data
        const orders = await getXbyY(db, `SELECT status, amount, utr, create_date FROM orders WHERE user_token = ? AND order_id = ?`, [user_token, order_id]);

        if (orders.length > 0) {
            const order = orders[0];
            const status = order.status;
            
            let responseBody = {
                status: 'COMPLETED',
                message: '',
                result: {
                    orderId: order_id,
                    status: status,
                    amount: order.amount,
                    date: order.create_date,
                    utr: order.utr || undefined
                }
            };

            if (status === 'SUCCESS') {
                responseBody.message = 'Transaction Successfully';
                responseBody.result.txnStatus = 'COMPLETED';
                responseBody.result.resultInfo = 'Transaction Success';
            } else if (status === 'FAILURE') {
                responseBody.message = 'Transaction Failed';
                responseBody.result.txnStatus = 'FAILURE';
                responseBody.result.resultInfo = 'Transaction Failed';
            } else {
                responseBody.message = 'Transaction Pending';
                responseBody.result.txnStatus = 'PENDING';
                responseBody.result.resultInfo = 'Transaction Pending';
            }
            
            return res.status(200).json(responseBody);

        } else {
            return res.status(404).json({
                status: 'COMPLETED',
                message: 'Order not found',
                result: null
            });
        }

    } catch (error) {
        console.error('Error in check-order API:', error);
        return res.status(500).json({ status: false, message: "Internal Server Error" });
    }
});

module.exports = router;
