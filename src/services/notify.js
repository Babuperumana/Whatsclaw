// Sends full booking/donation details to the temple admin number.
// Serializes sends with a minimum gap to avoid WhatsApp flagging the group
// for rapid-fire messages. Uses a simple in-memory last-send timestamp.

const { ADMIN_NOTIFY_JID } = require('../config');

const MIN_ADMIN_GAP_MS = 3000; // 3s between admin sends
let lastAdminSend = 0;

async function waitForAdminSlot() {
    const now = Date.now();
    const wait = Math.max(0, MIN_ADMIN_GAP_MS - (now - lastAdminSend));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
}

async function notifyAdmin(sock, text) {
    try {
        await waitForAdminSlot();
        await sock.sendMessage(ADMIN_NOTIFY_JID, { text });
        lastAdminSend = Date.now();
    } catch (err) {
        console.error('Failed to notify admin:', err.message);
    }
}

module.exports = { notifyAdmin };
