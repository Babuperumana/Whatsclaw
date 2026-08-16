const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('my-md-baileys');
const pino = require('pino');
const path = require('path');

// WhatsApp session lives under DATA_DIR so it survives restarts on a mounted volume.
const DATA_DIR = process.env.DATA_DIR || __dirname;

const { STATES } = require('./src/config');
const { createDb } = require('./src/services/db');
const { createPayment } = require('./src/services/payment');
const notify = require('./src/services/notify');
const { buildMainMenu } = require('./src/menus/mainMenu');
const { byOption, byState } = require('./src/menus');
const onboarding = require('./src/menus/onboarding');
const { t } = require('./src/i18n');
const { startReminderScheduler } = require('./src/services/reminders');

// In-memory state store, keyed by user JID.
const sessions = {};

// Live link status, surfaced to the dashboard so an admin can scan the QR from the
// browser instead of the container logs, and see the linked account once connected.
const botStatus = {
    connection: 'connecting', // 'connecting' | 'open' | 'close'
    qr: null,                 // latest raw QR string while waiting to link, else null
    user: null,               // { id, name } once connected
    connectedAt: null,        // epoch ms of last successful connection
    lastError: null           // human-readable reason for the last disconnect
};

// Handle to the current socket so the dashboard can trigger an unlink/relink and
// send messages. The raw DB handle is kept for the devotee broadcast.
let currentSock = null;
let rawDbRef = null;

// Progress of the most recent devotee broadcast, polled by the dashboard.
const broadcastStatus = {
    running: false,
    total: 0,
    sent: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
    lastError: null
};

// Delay between devotee sends, to avoid WhatsApp flagging the number for spam.
const BROADCAST_DELAY_MS = 15000;

// --- Presence simulation (human-like behavior to reduce ban risk) ---
// "composing" = typing indicator; "recording" = looks like a voice note is being
// recorded. WhatsApp shows these in the chat, making automated sends look more like
// a real person operating the device.
const TYPING_MIN_MS = parseInt(process.env.TYPING_MIN_MS || '1500', 10);
const TYPING_MAX_MS = parseInt(process.env.TYPING_MAX_MS || '3000', 10);
const RECORDING_MS = parseInt(process.env.RECORDING_MS || '1500', 10);

function randomTypingDelay() {
    return TYPING_MIN_MS + Math.floor(Math.random() * (TYPING_MAX_MS - TYPING_MIN_MS));
}

// Show composing (typing) then recording then paused around a single send.
// Skips the presence dance for group/admin targets since those aren't personal 1:1 chats.
async function sendWithPresence(sock, jid, content) {
    const isPhone = jid.endsWith('@s.whatsapp.net');
    if (isPhone) {
        try { await sock.sendPresenceUpdate('composing', jid); } catch (_) { /* best-effort */ }
        await new Promise(r => setTimeout(r, randomTypingDelay()));
    }
    const result = await sock.sendMessage(jid, buildContent(content));
    if (isPhone) {
        try {
            await sock.sendPresenceUpdate('recording', jid);
            await new Promise(r => setTimeout(r, RECORDING_MS));
            await sock.sendPresenceUpdate('paused', jid);
        } catch (_) { /* best-effort */ }
    }
    return result;
}

function getWhatsAppStatus() {
    return botStatus;
}

function getBroadcastStatus() {
    return broadcastStatus;
}

function ensureConnected() {
    if (!currentSock || botStatus.connection !== 'open') {
        throw new Error('WhatsApp is not connected. Link a device first.');
    }
}

// Normalize a raw phone number to a WhatsApp JID. Groups/newsletters are passed through.
function toJid(target) {
    if (!target) throw new Error('Recipient is required.');
    if (target.endsWith('@g.us') || target.endsWith('@s.whatsapp.net') || target.endsWith('@newsletter')) {
        return target;
    }
    const digits = target.replace(/\D/g, '');
    if (!digits) throw new Error('Invalid phone number.');
    return `${digits}@s.whatsapp.net`;
}

// Build a Baileys message object from a content descriptor produced by the route.
// { type, text, caption, buffer, fileName, mimetype }
function buildContent(content) {
    const { type, text, caption, buffer, fileName, mimetype } = content;
    switch (type) {
        case 'text':
            if (!text || !text.trim()) throw new Error('Text message cannot be empty.');
            return { text };
        case 'image':
            if (!buffer) throw new Error('Image file is required.');
            return { image: buffer, caption: caption || undefined };
        case 'video':
        case 'media':
            if (!buffer) throw new Error('Media file is required.');
            return { video: buffer, caption: caption || undefined };
        case 'document':
            if (!buffer) throw new Error('Document file is required.');
            return {
                document: buffer,
                fileName: fileName || 'document',
                mimetype: mimetype || 'application/octet-stream',
                caption: caption || undefined
            };
        default:
            throw new Error(`Unsupported message type: ${type}`);
    }
}

// Send a single message to one recipient (number, group, or newsletter).
// Shows "typing" then "recording" presence before sending to mimic a real
// person operating the device. Tracks failures on the devotee row so
// repeatedly unreachable numbers are eventually skipped.
async function sendWhatsAppMessage(target, content) {
    ensureConnected();
    const jid = toJid(target);

    // Only phone-number targets are tracked; groups and newsletters are admin-controlled.
    const isPhone = jid.endsWith('@s.whatsapp.net');
    const digits = isPhone ? jid.split('@')[0] : null;

    try {
        const result = await sendWithPresence(currentSock, jid, buildContent(content));
        if (isPhone && digits) {
            await markSendResult(digits, true);
        }
        return result;
    } catch (err) {
        if (isPhone && digits) {
            await markSendResult(digits, false, err.message);
        }
        throw err;
    }
}

// Increment send_failures on failure; reset to 0 on success. After 5 consecutive
// failures the devotee is auto-opted-out so reminders stop wasting sends on them.
async function markSendResult(digits, ok, errMessage) {
    if (!rawDbRef) return;
    const sql = ok
        ? 'UPDATE devotees SET send_failures = 0 WHERE phone_number = ?'
        : `UPDATE devotees
              SET send_failures = COALESCE(send_failures, 0) + 1,
                  opted_out = CASE WHEN COALESCE(send_failures, 0) + 1 >= 5 THEN 1 ELSE opted_out END
            WHERE phone_number = ?`;
    rawDbRef.run(sql, [digits], function (err) {
        if (err) return; // best-effort
        if (!ok && this.changes > 0) {
            rawDbRef.get(
                'SELECT send_failures, opted_out FROM devotees WHERE phone_number = ?',
                [digits],
                (_e, row) => {
                    if (row && row.opted_out === 1) {
                        console.warn(`[send-tracking] auto-opted-out ${digits} after ${row.send_failures} consecutive failures (${errMessage})`);
                    } else if (row) {
                        console.warn(`[send-tracking] ${digits} failure #${row.send_failures}: ${errMessage}`);
                    }
                }
            );
        }
    });
}

// List groups the linked account participates in, for the dashboard dropdown.
async function listGroups() {
    ensureConnected();
    const groups = await currentSock.groupFetchAllParticipating();
    return Object.values(groups).map(g => ({ id: g.id, subject: g.subject }));
}

// Broadcast to every devotee sequentially with a fixed delay between sends. Skips
// opted-out devotees and those with 5+ consecutive send failures. Runs in the
// background; progress is tracked in broadcastStatus and polled by the dashboard.
async function broadcastToDevotees(content) {
    ensureConnected();
    if (broadcastStatus.running) throw new Error('A broadcast is already in progress.');
    if (!rawDbRef) throw new Error('Database is not available.');

    const devotees = await new Promise((resolve, reject) => {
        rawDbRef.all(
            'SELECT phone_number FROM devotees WHERE phone_number IS NOT NULL AND opted_out = 0 AND COALESCE(send_failures, 0) < 5',
            [],
            (err, rows) => { if (err) reject(err); else resolve(rows || []); }
        );
    });

    // Log a warning if many recipients are being skipped.
    const totalAll = await new Promise((resolve, _) => {
        rawDbRef.get('SELECT COUNT(*) AS c FROM devotees WHERE phone_number IS NOT NULL', [], (_e, row) => resolve(row ? row.c : 0));
    });
    const skipped = totalAll - devotees.length;
    if (skipped > 0) {
        console.warn(`[broadcast] skipping ${skipped} of ${totalAll} devotees (opted-out or 5+ send failures)`);
    }

    Object.assign(broadcastStatus, {
        running: true,
        total: devotees.length,
        sent: 0,
        failed: 0,
        startedAt: Date.now(),
        finishedAt: null,
        lastError: null,
        skipped: skipped
    });

    // Fire-and-forget loop; the request returns immediately and the UI polls progress.
    (async () => {
        for (let i = 0; i < devotees.length; i++) {
            if (botStatus.connection !== 'open') {
                broadcastStatus.lastError = 'Connection lost during broadcast.';
                console.error('[broadcast] connection lost mid-broadcast — your number may be at ban risk. Consider switching to WhatsApp Business API.');
                break;
            }
            try {
                await sendWithPresence(currentSock, toJid(devotees[i].phone_number), buildContent(content));
                broadcastStatus.sent++;
            } catch (err) {
                broadcastStatus.failed++;
                broadcastStatus.lastError = err.message;
                console.error('[broadcast] failed for', devotees[i].phone_number, err.message);
            }
            if (i < devotees.length - 1) {
                await new Promise(r => setTimeout(r, BROADCAST_DELAY_MS));
            }
        }
        broadcastStatus.running = false;
        broadcastStatus.finishedAt = Date.now();
        console.log(`[broadcast] done: ${broadcastStatus.sent} sent, ${broadcastStatus.failed} failed` + (skipped > 0 ? ` (${skipped} skipped)` : ''));
    })();

    return { total: devotees.length, delayMs: BROADCAST_DELAY_MS, skipped };
}

// Count devotees eligible for a broadcast (for the UI preview).
function countDevotees() {
    return new Promise((resolve, reject) => {
        if (!rawDbRef) return resolve(0);
        rawDbRef.get('SELECT COUNT(*) AS c FROM devotees WHERE phone_number IS NOT NULL', [], (err, row) => {
            if (err) reject(err); else resolve(row ? row.c : 0);
        });
    });
}

// Unlink the current WhatsApp account. Baileys clears the on-disk creds and emits a
// 'close' with loggedOut, after which startBot() reconnects and a fresh QR is issued.
async function logoutWhatsApp() {
    if (!currentSock) throw new Error('WhatsApp is not initialized yet.');
    await currentSock.logout();
}

function initWhatsAppBot(rawDb) {
    rawDbRef = rawDb;
    const db = createDb(rawDb);
    const payment = createPayment(db);

    // Daily reminder scheduler (5PM tomorrow-reminders, 8:30AM performed-confirmations).
    // Decoupled via deps so the service never touches Baileys directly.
    startReminderScheduler(rawDb, {
        sendMessage: (target, content) => sendWhatsAppMessage(target, content),
        isConnected: () => botStatus.connection === 'open'
    });

    async function handleMessage(sock, msg) {
        if (!msg.message || msg.key.fromMe) return;

        console.log("INCOMING MESSAGE DUMP:", JSON.stringify(msg, null, 2));

        let jid = msg.key.remoteJidAlt || msg.key.remoteJid;

        // WhatsApp sometimes hides numbers behind LIDs (Linked IDs).
        // We try to extract the real number if it's available in the participant fields.
        if (jid.includes('@lid')) {
            if (msg.key.participant) {
                jid = msg.key.participant;
            } else if (msg.participant) {
                jid = msg.participant;
            }
        }

        const userPhone = jid.split('@')[0];
        const pushName = msg.pushName || '';
        // Interactive replies carry their selection id in different envelopes
        // depending on the button type. Normalise them all to plain text so the
        // menu handlers only ever deal with a string.
        const listReplyId = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId;
        const buttonReplyId = msg.message.buttonsResponseMessage?.selectedButtonId;
        const templateReplyId = msg.message.templateButtonReplyMessage?.selectedId;
        let interactiveReplyId;
        const nativeFlowParams = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        if (nativeFlowParams) {
            try { interactiveReplyId = JSON.parse(nativeFlowParams).id; } catch (e) { /* ignore malformed */ }
        }
        const messageText = listReplyId
            || buttonReplyId
            || templateReplyId
            || interactiveReplyId
            || msg.message.conversation
            || msg.message.extendedTextMessage?.text;
        if (!messageText) return;

        const text = messageText.trim();
        if (!sessions[jid]) sessions[jid] = { state: STATES.IDLE };
        const session = sessions[jid];

        // Shared context handed to every menu module.
        const ctx = { sock, jid, text, session, userPhone, pushName, db, payment, notify };

        // Gate every conversation on devotee registration. Unknown numbers
        // are onboarded (language selection) before they reach the menu.
        const devotee = await onboarding.findDevotee(db, userPhone);
        if (!devotee) {
            return onboarding.start(ctx);
        }
        session.language = devotee.language;

        // --- STOP keyword handling (opt-out from automated reminders) ---
        const lowered = text.toLowerCase().trim();
        if (lowered === 'stop' || lowered === 'unsubscribe' || lowered === 'quit' || lowered === 'വിട') {
            try {
                const result = await new Promise((resolve) => {
                    rawDbRef.run(
                        'UPDATE devotees SET opted_out = 1 WHERE phone_number = ?',
                        [userPhone],
                        function (err) { resolve(err ? null : this.changes); }
                    );
                });
                if (result && result > 0) {
                    console.log('[optout] devotee opted out:', userPhone);
                }
            } catch (e) {
                console.error('[optout] failed for', userPhone, e.message);
            }
            const stopMsg = session.language === 'Malayalam'
                ? 'നിങ്ങളുടെ എല്ലാ ഓട്ടോമാറ്റഡ് അറിയിപ്പുകളും നിര്‍ത്തിയിരിക്കുന്നു. ആവശ്യമെങ്കിൽ "start" ടൈപ്പ് ചെയ്ത് പുനഃസഹായം.'
                : session.language === 'Tamil'
                    ? 'உங்கள் அனைத்து தானியக்கி அறிவிப்புகளும் நிறுத்தப்பட்டுள்ளன. "start" ஐ அழுத்தி மீண்டும் தொடங்கலாம்.'
                    : session.language === 'Hindi'
                        ? 'आपके सभी स्वचालित सूचनाएं बंद कर दी गई हैं। "start" टाइप करके पुनः साइन-इन करें।'
                        : 'You have been opted out of all automated reminders. Type "start" to re-enable them.';
            await sock.sendMessage(jid, { text: stopMsg });
            session.state = STATES.IDLE;
            return;
        }
        // Allow re-enrollment: START / YES / ഹോം from an opted-out user
        if (lowered === 'start' || lowered === 'yes' || lowered === 'ഹോം' || lowered === 'ആരംഭം') {
            try {
                const result = await new Promise((resolve) => {
                    rawDbRef.run(
                        'UPDATE devotees SET opted_out = 0, send_failures = 0 WHERE phone_number = ?',
                        [userPhone],
                        function (err) { resolve(err ? null : this.changes); }
                    );
                });
                if (result && result > 0) {
                    console.log('[optout] devotee re-enrolled:', userPhone);
                }
            } catch (e) {
                console.error('[optout] re-enroll failed for', userPhone, e.message);
            }
        }

        try {
            if (text.toLowerCase() === 'hi' || text.toLowerCase() === 'hello' || text === '0') {
                session.state = STATES.IDLE;
                return sock.sendMessage(jid, buildMainMenu(session.language));
            }

            if (session.state === STATES.IDLE) {
                // At the main menu: route by the option number the user picked.
                const menu = byOption[text];
                if (menu) {
                    await menu.start(ctx);
                } else {
                    await sock.sendMessage(jid, { text: t(session.language, 'common.invalid_option') });
                }
            } else {
                // Mid-flow: hand off to the menu module that owns this state.
                const menu = byState[session.state];
                if (menu) {
                    await menu.handle(ctx);
                } else {
                    session.state = STATES.IDLE;
                    await sock.sendMessage(jid, buildMainMenu(session.language));
                }
            }
        } catch (e) {
            console.error('Error handling message:', e);
            sock.sendMessage(jid, { text: t(session.language, 'common.error') });
            session.state = STATES.IDLE;
        }
    }

    async function startBot() {
        console.log("Starting WhatsApp Bot...");
        // auth_info_baileys lives under DATA_DIR (a mounted volume in production).
        const { state, saveCreds } = await useMultiFileAuthState(path.join(DATA_DIR, 'auth_info_baileys'));
        console.log("Auth state loaded.");

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'info' })
        });
        currentSock = sock;

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                // Expose the QR to the dashboard and still log it for convenience.
                botStatus.qr = qr;
                botStatus.connection = 'connecting';
                console.log("Please scan the following QR Code in WhatsApp to link the bot:");
                require('qrcode-terminal').generate(qr, { small: true });
            }
            if (connection === 'close') {
                botStatus.connection = 'close';
                botStatus.qr = null;
                botStatus.user = null;
                botStatus.lastError = lastDisconnect?.error?.message || 'Connection closed';
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                // Linked: clear the QR and record the account details for the dashboard.
                botStatus.connection = 'open';
                botStatus.qr = null;
                botStatus.lastError = null;
                botStatus.connectedAt = Date.now();
                botStatus.user = {
                    id: (sock.user?.id || '').split(':')[0].split('@')[0],
                    name: sock.user?.name || sock.user?.verifiedName || ''
                };
                console.log('✅ WhatsApp Bot Connected!');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async m => {
            for (const msg of m.messages) {
                await handleMessage(sock, msg);
            }
        });
    }

    startBot();
}

module.exports = {
    initWhatsAppBot,
    getWhatsAppStatus,
    logoutWhatsApp,
    sendWhatsAppMessage,
    listGroups,
    broadcastToDevotees,
    getBroadcastStatus,
    countDevotees,
    ADMIN_NOTIFY_JID: require('./src/config').ADMIN_NOTIFY_JID
};
