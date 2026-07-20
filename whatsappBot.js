const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('ai-md-baileys');
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
async function sendWhatsAppMessage(target, content) {
    ensureConnected();
    const jid = toJid(target);
    return currentSock.sendMessage(jid, buildContent(content));
}

// List groups the linked account participates in, for the dashboard dropdown.
async function listGroups() {
    ensureConnected();
    const groups = await currentSock.groupFetchAllParticipating();
    return Object.values(groups).map(g => ({ id: g.id, subject: g.subject }));
}

// Broadcast to every devotee sequentially with a fixed delay between sends. Runs in
// the background; progress is tracked in broadcastStatus and polled by the dashboard.
async function broadcastToDevotees(content) {
    ensureConnected();
    if (broadcastStatus.running) throw new Error('A broadcast is already in progress.');
    if (!rawDbRef) throw new Error('Database is not available.');

    const devotees = await new Promise((resolve, reject) => {
        rawDbRef.all('SELECT phone_number FROM devotees WHERE phone_number IS NOT NULL', [], (err, rows) => {
            if (err) reject(err); else resolve(rows || []);
        });
    });

    Object.assign(broadcastStatus, {
        running: true,
        total: devotees.length,
        sent: 0,
        failed: 0,
        startedAt: Date.now(),
        finishedAt: null,
        lastError: null
    });

    // Fire-and-forget loop; the request returns immediately and the UI polls progress.
    (async () => {
        for (let i = 0; i < devotees.length; i++) {
            // Bail out if the connection drops mid-broadcast.
            if (botStatus.connection !== 'open') {
                broadcastStatus.lastError = 'Connection lost during broadcast.';
                break;
            }
            try {
                await currentSock.sendMessage(toJid(devotees[i].phone_number), buildContent(content));
                broadcastStatus.sent++;
            } catch (err) {
                broadcastStatus.failed++;
                broadcastStatus.lastError = err.message;
                console.error('[broadcast] failed for', devotees[i].phone_number, err.message);
            }
            // Delay between sends (skip after the last one).
            if (i < devotees.length - 1) {
                await new Promise(r => setTimeout(r, BROADCAST_DELAY_MS));
            }
        }
        broadcastStatus.running = false;
        broadcastStatus.finishedAt = Date.now();
        console.log(`[broadcast] done: ${broadcastStatus.sent} sent, ${broadcastStatus.failed} failed`);
    })();

    return { total: devotees.length, delayMs: BROADCAST_DELAY_MS };
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

        try {
            // If the devotee is mid-onboarding, keep handling the language step.
            if (session.state === STATES.LANGUAGE_SELECT) {
                const picked = await onboarding.handle(ctx);
                if (picked) await sock.sendMessage(jid, buildMainMenu(session.language));
                return;
            }

            // Gate every conversation on devotee registration. Unknown numbers
            // are onboarded (language selection) before they reach the menu.
            const devotee = await onboarding.findDevotee(db, userPhone);
            if (!devotee) {
                return onboarding.start(ctx);
            }
            session.language = devotee.language;

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
