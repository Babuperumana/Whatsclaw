// Sends full booking/donation details to the temple admin number.

const { ADMIN_NOTIFY_JID } = require('../config');

async function notifyAdmin(sock, text) {
    try {
        await sock.sendMessage(ADMIN_NOTIFY_JID, { text });
    } catch (err) {
        console.error('Failed to notify admin:', err.message);
    }
}

module.exports = { notifyAdmin };
