const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const { requireAuth } = require('../middleware/auth');
const {
    getWhatsAppStatus,
    logoutWhatsApp,
    sendWhatsAppMessage,
    listGroups,
    broadcastToDevotees,
    getBroadcastStatus,
    countDevotees,
    ADMIN_NOTIFY_JID
} = require('../whatsappBot');

// Uploads land on the persistent volume (temp) and are deleted right after sending.
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

router.use(requireAuth);

// Page shell - live state is fetched client-side.
router.get('/', (req, res) => {
    res.render('whatsapp', { user: req.user, userRole: (req.user.role || 'User').toLowerCase() });
});

// JSON status for the dashboard to poll. When unlinked, the raw QR is converted
// to a data-URL image here so the browser can render it directly.
router.get('/status', async (req, res) => {
    const status = getWhatsAppStatus();
    let qrImage = null;
    if (status.qr) {
        try {
            qrImage = await QRCode.toDataURL(status.qr, { margin: 1, width: 300 });
        } catch (err) {
            console.error('[whatsapp] Failed to render QR:', err.message);
        }
    }
    let devoteeCount = 0;
    try { devoteeCount = await countDevotees(); } catch (e) { /* ignore */ }
    res.json({
        connection: status.connection,
        connected: status.connection === 'open',
        user: status.user,
        connectedAt: status.connectedAt,
        lastError: status.lastError,
        qrImage,
        devoteeCount
    });
});

// Groups the linked account belongs to, for the recipient dropdown.
router.get('/groups', async (req, res) => {
    try {
        const groups = await listGroups();
        res.json({ ok: true, groups });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// Live progress of an in-flight devotee broadcast.
router.get('/broadcast-status', (req, res) => {
    res.json(getBroadcastStatus());
});

// Build the content descriptor from the multipart body + uploaded file.
function buildContentFromRequest(req) {
    const { type, text, caption } = req.body;
    const content = { type: type || 'text', text, caption };
    if (req.file) {
        content.buffer = fs.readFileSync(req.file.path);
        content.fileName = req.file.originalname;
        content.mimetype = req.file.mimetype;
    }
    return content;
}

// Send a message. target = 'number' | 'group' | 'devotees' | 'test'.
router.post('/send', upload.single('file'), async (req, res) => {
    const tempPath = req.file ? req.file.path : null;
    try {
        const { target, to } = req.body;
        const content = buildContentFromRequest(req);

        if (target === 'devotees') {
            const result = await broadcastToDevotees(content);
            return res.json({
                ok: true,
                broadcast: true,
                total: result.total,
                delayMs: result.delayMs
            });
        }

        if (target === 'test') {
            await sendWhatsAppMessage(ADMIN_NOTIFY_JID, content);
            return res.json({ ok: true, sentTo: ADMIN_NOTIFY_JID });
        }

        // number or group — both just need a recipient JID/number in `to`.
        if (!to) throw new Error('Recipient is required.');
        await sendWhatsAppMessage(to, content);
        res.json({ ok: true, sentTo: to });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    } finally {
        // Always clean up the temp upload.
        if (tempPath) fs.promises.unlink(tempPath).catch(() => {});
    }
});

// Unlink the current account so a fresh QR can be scanned.
router.post('/logout', async (req, res) => {
    try {
        await logoutWhatsApp();
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

module.exports = router;
