// Automated WhatsApp reminders for the temple bot.
//
//   Evening (default 17:00 IST): remind devotees of TOMORROW's poojas —
//     • booked vazhipadus  (vazhipadu_bookings.performing_date == tomorrow)
//     • monthly nakshathra poojas whose next occurrence falls tomorrow
//   Morning (default 08:30 IST): confirm TODAY's poojas are being performed —
//     the same two sources, matched to today.
//   Admin Panchangam (default 16:50 IST): send tomorrow's full Panchangam
//     report to the temple admin WhatsApp number.
//
// Vazhipadu and nakshathra reminders are sent as SEPARATE messages, each in the
// devotee's stored language (falling back to English).
//
// Scheduling is in-process: a 60s interval checks the current IST time and fires
// each slot once per IST day. A reminder_runs row per (slot, run_date) makes this
// idempotent across restarts, so a crash-and-reboot never double-sends. The engine
// runs the container in UTC; every "today/tomorrow" decision is computed in IST.

const { createDb } = require('./db');
const { t } = require('../i18n');
const { ADMIN_NOTIFY_JID } = require('../config');
const { buildPanchangamMessage, tomorrowIso } = require('./adminPanchangam');

const TZ = 'Asia/Kolkata';

// Slot fire times in IST (24h). Overridable via env for testing/tuning.
const EVENING_HOUR = parseInt(process.env.REMINDER_EVENING_HOUR || '17', 10);   // 5 PM
const EVENING_MIN = parseInt(process.env.REMINDER_EVENING_MIN || '0', 10);
const MORNING_HOUR = parseInt(process.env.REMINDER_MORNING_HOUR || '8', 10);    // 8:30 AM
const MORNING_MIN = parseInt(process.env.REMINDER_MORNING_MIN || '30', 10);

// Admin Panchangam: sends tomorrow's full Panchangam to the temple admin
// every day at 16:50 IST (4:50 PM). Uses the native Panchangam engine
// (myassets/js/panchangam) for accurate astronomical data.
const PANCHANGAM_HOUR = parseInt(process.env.PANCHANGAM_HOUR || '16', 10);
const PANCHANGAM_MIN = parseInt(process.env.PANCHANGAM_MIN || '50', 10);

// Admin Nakshathra Reminder: sends tomorrow's nakshathra pooja details (all
// active devotees, grouped by nakshathram) to the admin WhatsApp group at
// 16:55 IST (4:55 PM). Runs after the Panchangam so admins get the full
// picture in one flow.
const NAKSHATHRA_ADMIN_HOUR = parseInt(process.env.NAKSHATHRA_ADMIN_HOUR || '16', 10);
const NAKSHATHRA_ADMIN_MIN = parseInt(process.env.NAKSHATHRA_ADMIN_MIN || '55', 10);

// Delay between individual sends, to avoid WhatsApp flagging the number for spam.
const REMINDER_DELAY_MS = parseInt(process.env.REMINDER_DELAY_MS || '5000', 10);

const CHECK_INTERVAL_MS = 60 * 1000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- IST date helpers -------------------------------------------------------

// Current wall-clock time in IST, as a Date whose local fields read as IST.
function istNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

// 'YYYY-MM-DD' for a Date's local fields (used for panchangam + reminder_runs).
function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// 'DD/MM/YYYY' for a Date's local fields (matches vazhipadu_bookings.performing_date).
function dmyDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}/${m}/${y}`;
}

function addDays(d, n) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
}

// --- panchangam (lazy, tolerant) -------------------------------------------
// Same graceful-degradation pattern the Settings menu uses: if the native engine
// can't load, nakshathra reminders are skipped but vazhipadu reminders still send.
let panchangam = null;
let panchangamError = null;
function getPanchangam() {
    if (panchangam || panchangamError) return panchangam;
    try {
        panchangam = require('../../myassets/js/panchangam');
    } catch (e) {
        panchangamError = e;
        console.error('⚠️  [reminders] panchangam unavailable, nakshathra reminders disabled:', e.message);
    }
    return panchangam;
}

// --- core -------------------------------------------------------------------

function createReminderService(rawDb, { sendMessage, isConnected }) {
    const db = createDb(rawDb);

    // Build a phone -> language map from the devotees table. Keyed by digits only,
    // so number/JID formatting differences never break the lookup.
    async function languageByPhone() {
        const rows = await db.getXbyY('SELECT phone_number, language FROM devotees', []);
        const map = {};
        for (const r of rows) {
            const digits = String(r.phone_number || '').replace(/\D/g, '');
            if (digits) map[digits] = r.language || 'English';
        }
        return map;
    }

    function langFor(map, phone) {
        return map[String(phone || '').replace(/\D/g, '')] || 'English';
    }

    // Vazhipadu bookings performing on the given IST date (Date object).
    async function vazhipaduFor(dateObj) {
        return db.getXbyY(
            `SELECT phone_number, vazhipadu_name, devotee_name, nakshathram, performing_date
               FROM vazhipadu_bookings
              WHERE performing_date = ? AND status = 'CONFIRMED'`,
            [dmyDate(dateObj)]
        );
    }

    // Active nakshathra poojas whose next occurrence is the given IST date.
    async function nakshathraFor(dateObj) {
        const p = getPanchangam();
        if (!p || typeof p.getNextNakshatraDates !== 'function') return [];
        const targetIso = isoDate(dateObj);
        const rows = await db.getXbyY(
            `SELECT name, nakshathram, whatsapp_number
               FROM nakshathra_pooja WHERE status = 'ACTIVE'`,
            []
        );
        const due = [];
        for (const r of rows) {
            try {
                const res = p.getNextNakshatraDates(r.nakshathram, 1);
                if (res && res.length && res[0].date === targetIso) due.push(r);
            } catch (e) {
                console.error('[reminders] nakshathra lookup failed for', r.nakshathram, e.message);
            }
        }
        return due;
    }

    // Send one text message, tolerating per-recipient failures.
    async function send(phone, text) {
        try {
            await sendMessage(phone, { type: 'text', text });
            return true;
        } catch (e) {
            console.error('[reminders] send failed for', phone, e.message);
            return false;
        }
    }

    // Run a slot: 'evening' (tomorrow), 'morning' (today), or 'panchangam'.
    async function runSlot(slot, runDateObj) {
        // Idempotency guard: claim the (slot, run_date) row first. If it already
        // exists, another run (or a pre-restart run) already handled this batch.
        const runDate = isoDate(runDateObj);
        const claim = await db.setXbyY(
            'INSERT OR IGNORE INTO reminder_runs (slot, run_date) VALUES (?, ?)',
            [slot, runDate]
        );
        if (!claim || claim.changes === 0) return; // already ran today

        if (!isConnected()) {
            console.warn(`[reminders] ${slot} slot due but WhatsApp not connected; skipping ${runDate}`);
            return;
        }

        // --- Admin Panchangam: send tomorrow's full report to the admin ---
        if (slot === 'panchangam') {
            const msg = buildPanchangamMessage(tomorrowIso(), 'Malayalam');
            const adminJid = ADMIN_NOTIFY_JID;
            try {
                await sendMessage(adminJid, { type: 'text', text: msg.text });
                await db.setXbyY('UPDATE reminder_runs SET sent_count = 1 WHERE slot = ? AND run_date = ?',
                    [slot, runDate]);
                console.log(`[reminders] panchangam sent to admin for tomorrow`);
            } catch (e) {
                console.error('[reminders] panchangam send failed:', e.message);
            }
            return;
        }

        // --- Admin Nakshathra Reminder: tomorrow's pooja list ---
        // Uses the SAME getPanchangam() as the 4:50PM reminder — same source of truth.
        // Reads pan.nakshathram.ml directly (same value that appears as
        // '📌 നാളെത്തെ നക്ഷത്രം' in the panchangam message).
        if (slot === 'nakshathra_admin') {
            const tomorrowDate = tomorrowIso();

            let malWeekday = '', malMonth = '', malDayNum = '', malYear = '';
            let tomorrowNakMl = '';

            try {
                const pan = getPanchangam(tomorrowDate);
                if (pan) {
                    malWeekday = (pan.weekday && pan.weekday.ml) || '';
                    malMonth   = (pan.kollavarsham && pan.kollavarsham.monthMl) || '';
                    malDayNum  = (pan.kollavarsham && pan.kollavarsham.day) || '';
                    malYear    = (pan.kollavarsham && pan.kollavarsham.year) || '';
                    // This is the EXACT same value shown in the 4:50PM message as:
                    //   📌 നാളെത്തെ നക്ഷത്രം:
                    //      മകയിരം
                    tomorrowNakMl = (pan.nakshathram && pan.nakshathram.ml) || '';
                }
            } catch (e) {
                console.error('[reminders] nakshathra_admin panchangam lookup failed:', e.message);
            }

            if (!tomorrowNakMl) {
                await db.setXbyY('UPDATE reminder_runs SET sent_count = 0 WHERE slot = ? AND run_date = ?',
                    [slot, runDate]);
                console.log(`[reminders] nakshathra_admin: no nakshathram for ${tomorrowDate}`);
                return;
            }

            // Fetch devotees for tomorrow's nakshathram
            const devotees = await db.getXbyY(
                `SELECT name, nakshathram, whatsapp_number
                 FROM nakshathra_pooja
                 WHERE status = 'ACTIVE' AND nakshathram = ?
                 ORDER BY id`,
                [tomorrowNakMl]
            );

            if (devotees.length === 0) {
                await db.setXbyY('UPDATE reminder_runs SET sent_count = 0 WHERE slot = ? AND run_date = ?',
                    [slot, runDate]);
                console.log(`[reminders] nakshathra_admin: no devotees for ${tomorrowNakMl} on ${tomorrowDate}`);
                return;
            }

            // Build message: DD/MM/YYYY format
            const [ty, tm, td] = tomorrowDate.split('-');
            const dateStr = `${td}/${tm}/${ty}`;

            const lines = [];
            lines.push('നാളത്തെ ജന്മ നക്ഷത്ര പൂജകൾ');
            lines.push(`തീയതി${dateStr} ${malWeekday}`);
            lines.push(`${malMonth} ${malDayNum}, ${malYear}`);
            lines.push('');
            lines.push(`⭐ ${tomorrowNakMl}`);
            devotees.forEach((it, i) => {
                const phone = (it.whatsapp_number || '').replace(/@s\.whatsapp\.net$/, '');
                const name = it.name || 'അജ്ഞാത';
                lines.push(`${i + 1}      ${name}${' '.repeat(Math.max(1, 44 - name.length))}${phone}`);
            });

            try {
                await sendMessage(ADMIN_NOTIFY_JID, { type: 'text', text: lines.join('\n') });
                await db.setXbyY('UPDATE reminder_runs SET sent_count = ? WHERE slot = ? AND run_date = ?',
                    [devotees.length, slot, isoDate(runDateObj)]);
                console.log(`[reminders] nakshathra_admin sent: ${devotees.length} devotees for ${tomorrowNakMl}`);
            } catch (e) {
                console.error('[reminders] nakshathra_admin send failed:', e.message);
            }
            return;
        }

        const isEvening = slot === 'evening';
        const targetDate = isEvening ? addDays(runDateObj, 1) : runDateObj;
        const dateLabel = dmyDate(targetDate);
        const vKey = isEvening ? 'reminders.vazhipadu_tomorrow' : 'reminders.vazhipadu_today';
        const nKey = isEvening ? 'reminders.nakshathra_tomorrow' : 'reminders.nakshathra_today';

        const langMap = await languageByPhone();
        const [vazhipadus, nakshathras] = await Promise.all([
            vazhipaduFor(targetDate),
            nakshathraFor(targetDate)
        ]);

        let sent = 0;
        const total = vazhipadus.length + nakshathras.length;
        console.log(`[reminders] ${slot} for ${dateLabel}: ${vazhipadus.length} vazhipadu + ${nakshathras.length} nakshathra`);

        // Vazhipadu reminders – group by phone so one message per person covers all their vazhipadus.
        const groups = new Map();
        for (const b of vazhipadus) {
            if (!groups.has(b.phone_number)) groups.set(b.phone_number, []);
            groups.get(b.phone_number).push(b);
        }
        let sentCount = 0;
        for (const [phone, items] of groups) {
            if (!isConnected()) { console.warn('[reminders] connection lost mid-run; stopping'); break; }
            const lang = langFor(langMap, phone);
            const name = (items[0].devotee_name || '').trim() || 'Devotee';
            if (items.length === 1) {
                const b = items[0];
                const text = t(lang, vKey, {
                    name, vazhipadu: b.vazhipadu_name || '', devotee: b.devotee_name || '',
                    nak: b.nakshathram || '', date: dateLabel
                });
                if (await send(phone, text)) sentCount++;
            } else {
                const itemLines = items.map(b => `• ${b.vazhipadu_name} — ${b.devotee_name} (${b.nakshathram || '—'})`).join('\n');
                const multiKey = isEvening ? 'reminders.vazhipadu_tomorrow_multi' : 'reminders.vazhipadu_today_multi';
                const text = t(lang, multiKey, { name, count: items.length, items: itemLines, date: dateLabel });
                if (await send(phone, text)) sentCount++;
            }
            if (sentCount < groups.size) await sleep(REMINDER_DELAY_MS);
        }

        // Nakshathra pooja reminders.
        for (let i = 0; i < nakshathras.length; i++) {
            if (!isConnected()) { console.warn('[reminders] connection lost mid-run; stopping'); break; }
            const r = nakshathras[i];
            const lang = langFor(langMap, r.whatsapp_number);
            const text = t(lang, nKey, {
                name: r.name || '',
                nak: r.nakshathram || '',
                date: dateLabel
            });
            if (await send(r.whatsapp_number, text)) sentCount++;
            if (i < nakshathras.length - 1) await sleep(REMINDER_DELAY_MS);
        }

        await db.setXbyY('UPDATE reminder_runs SET sent_count = ? WHERE slot = ? AND run_date = ?',
            [sentCount, slot, runDate]);
        console.log(`[reminders] ${slot} for ${dateLabel} done: ${sentCount}/${total} sent`);
    }

    // Fired every minute: decide whether either slot is due now (IST).
    let ticking = false;
    async function tick() {
        if (ticking) return;              // never overlap runs
        ticking = true;
        try {
            const now = istNow();
            const mins = now.getHours() * 60 + now.getMinutes();
            const eveningMins = EVENING_HOUR * 60 + EVENING_MIN;
            const morningMins = MORNING_HOUR * 60 + MORNING_MIN;
            const panchangamMins = PANCHANGAM_HOUR * 60 + PANCHANGAM_MIN;
            const nakshathraAdminMins = NAKSHATHRA_ADMIN_HOUR * 60 + NAKSHATHRA_ADMIN_MIN;

            // '>=' (not '==') so a slightly late boot still catches the day's batch;
            // the reminder_runs guard keeps it to one send per slot per day.
            if (mins >= morningMins && mins < eveningMins) {
                await runSlot('morning', now);
            }
            if (mins >= panchangamMins) {
                await runSlot('panchangam', now);
            }
            if (mins >= nakshathraAdminMins) {
                await runSlot('nakshathra_admin', now);
            }
            if (mins >= eveningMins) {
                await runSlot('evening', now);
            }
        } catch (e) {
            console.error('[reminders] tick error:', e.message);
        } finally {
            ticking = false;
        }
    }

    return { tick, runSlot, _internals: { vazhipaduFor, nakshathraFor, languageByPhone, langFor } };
}

// Ensure the reminder_runs table exists (migrates existing production databases
// that predate this feature; fresh installs already have it from initDb.js).
function ensureTable(rawDb) {
    return new Promise((resolve) => {
        rawDb.run(
            `CREATE TABLE IF NOT EXISTS reminder_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slot TEXT NOT NULL,
                run_date TEXT NOT NULL,
                sent_count INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(slot, run_date)
            )`,
            (err) => {
                if (err) console.error('[reminders] could not ensure reminder_runs table:', err.message);
                resolve();
            }
        );
    });
}

// Wire up and start the 60s scheduler. `deps` supplies the send function and a
// connection check from whatsappBot, so this module stays decoupled from Baileys.
function startReminderScheduler(rawDb, deps) {
    if (process.env.REMINDERS_ENABLED === 'false') {
        console.log('[reminders] disabled via REMINDERS_ENABLED=false');
        return null;
    }
    const service = createReminderService(rawDb, deps);
    ensureTable(rawDb).then(() => {
        service.tick();                              // run once at boot
        setInterval(() => service.tick(), CHECK_INTERVAL_MS);
        const hh = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        console.log(`[reminders] scheduler started (morning ${hh(MORNING_HOUR, MORNING_MIN)}, panchangam ${hh(PANCHANGAM_HOUR, PANCHANGAM_MIN)}, nakshathra_admin ${hh(NAKSHATHRA_ADMIN_HOUR, NAKSHATHRA_ADMIN_MIN)}, evening ${hh(EVENING_HOUR, EVENING_MIN)} IST)`);
    });
    return service;
}

module.exports = { startReminderScheduler, createReminderService, ensureTable };
