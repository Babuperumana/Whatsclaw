// UPI payment flow: generates a unique-amount QR code and polls for success.
// Call createPayment({ getXbyY, setXbyY }) to bind it to the db helpers.

const crypto = require('crypto');
const qrcode = require('qrcode');
const { t } = require('../i18n');

function createPayment({ getXbyY, setXbyY }) {
    // Caller provides the order_id so it can be a short sequential ID (V###### / D######).
    async function generateUPIPayment(jid, amount, sock, order_id, callbackSuccess, language) {
        try {
            const adminUsers = await getXbyY('SELECT user_token, id FROM users WHERE role = "admin" LIMIT 1');
            if (adminUsers.length === 0) return sock.sendMessage(jid, { text: t(language, 'payment.admin_error') });
            const user_token = adminUsers[0].user_token;
            const user_id = adminUsers[0].id;

            const bharatpe_tokens = await getXbyY('SELECT Upiid, merchantId FROM bharatpe_tokens WHERE user_id = ? LIMIT 1', [user_id]);
            const upi_id = bharatpe_tokens.length > 0 ? bharatpe_tokens[0].Upiid : 'admin@upi';

            const pay_token = crypto.randomBytes(4).toString('hex');
            const session_amount = parseFloat(amount).toFixed(2);

            const now = new Date();
            const create_timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
            const expireDate = new Date(now.getTime() + 5 * 60000);
            const expire_timestamp = expireDate.toISOString().replace('T', ' ').substring(0, 19);

            let unique_amount = parseFloat(session_amount);
            let found = false;
            const one_min_ago = new Date(Date.now() - 60000).toISOString().replace('T', ' ').substring(0, 19);

            for (let i = 0; i < 100; i++) {
                const candidate = parseFloat((parseFloat(session_amount) + 0.01 * i).toFixed(2));
                const check = await getXbyY(`SELECT 1 FROM bharatpe_session_information WHERE upi_id = ? AND status = 'PENDING' AND create_timestamp >= ? AND ABS(session_amount - ?) < 0.0001 LIMIT 1`, [upi_id, one_min_ago, candidate]);
                if (check.length === 0) {
                    unique_amount = candidate;
                    found = true; break;
                }
            }

            if (!found) return sock.sendMessage(jid, { text: t(language, 'payment.too_many') });

            await setXbyY(`INSERT INTO orders (gateway_txn, amount, order_id, status, user_token, method, user_id, create_date) VALUES (?, ?, ?, 'PENDING', ?, 'Bharatpe', ?, CURRENT_TIMESTAMP)`, [crypto.randomBytes(6).toString('hex'), amount, order_id, user_token, user_id]);
            await setXbyY(`INSERT INTO bharatpe_session_information (order_id, upi_id, amount, session_amount, pay_token, create_timestamp, expire_timestamp, status, is_session_am_set) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'yes')`, [order_id, upi_id, amount, unique_amount, pay_token, create_timestamp, expire_timestamp]);

            const upi_deep_link = `upi://pay?pa=${encodeURIComponent(upi_id)}&am=${unique_amount}&pn=${encodeURIComponent("Temple")}&tn=${encodeURIComponent(order_id)}`;
            const qrBuffer = await qrcode.toBuffer(upi_deep_link, { width: 300 });

            await sock.sendMessage(jid, {
                image: qrBuffer,
                caption: t(language, 'payment.qr_caption', { amount: unique_amount })
            });

            let attempts = 0;
            const pollInterval = setInterval(async () => {
                attempts++;
                if (attempts > 60) { // 5 mins
                    clearInterval(pollInterval);
                    sock.sendMessage(jid, { text: t(language, 'payment.session_expired') });
                    return;
                }

                try {
                    const response = await fetch('http://localhost:3001/payment4/status.php', {
                        method: 'POST',
                        body: JSON.stringify({ order_id }),
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const json = await response.json();

                    if (json.status === 'SUCCESS') {
                        clearInterval(pollInterval);
                        callbackSuccess(order_id);
                    }
                } catch (err) {
                    console.error("Error checking payment status:", err.message);
                }
            }, 5000);

        } catch (e) {
            console.error(e);
            sock.sendMessage(jid, { text: t(language, 'payment.generate_error') });
        }
    }

    return { generateUPIPayment };
}

module.exports = { createPayment };
