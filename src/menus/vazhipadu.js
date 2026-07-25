// Option 3: Vazhipadu Bookings — multi-step flow.
// Flow: pick item (list) -> devotee name -> pick nakshathram (list, Malayalam)
//       -> pick performing date (list of next 30 days with each day's nakshathram)
//       -> add another? -> summary with Confirm/Cancel buttons -> payment.
// Nakshathram-per-date data comes from myassets/js/panchangam.js.

const { STATES } = require('../config');
const { t } = require('../i18n');
const { adminMsg } = require('../i18n/admin');

// panchangam.js pulls in a native calendar engine (./panchang-engine). If that
// engine isn't installed yet we don't want the whole bot to fail to boot, so we
// load it lazily and tolerate its absence — the flow still works, dates just
// won't show their nakshathram until the engine is present.
let panchangam = null;
let panchangamError = null;
function getPanchangam() {
    if (panchangam || panchangamError) return panchangam;
    try {
        panchangam = require('../../myassets/js/panchangam');
    } catch (e) {
        panchangamError = e;
        console.error('⚠️  panchangam module unavailable, nakshathram data disabled:', e.message);
    }
    return panchangam;
}

// The 27 nakshathram names, used as a fallback when the engine can't be loaded.
const NAKS_FALLBACK = ['അശ്വതി', 'ഭരണി', 'കാർത്തിക', 'രോഹിണി', 'മകയിരം', 'തിരുവാതിര', 'പുണർതം', 'പൂയം', 'ആയില്യം', 'മകം', 'പൂരം', 'ഉത്രം', 'അത്തം', 'ചിത്തിര', 'ചോതി', 'വിശാഖം', 'അനിഴം', 'തൃക്കേട്ട', 'മൂലം', 'പൂരാടം', 'ഉത്രാടം', 'തിരുവോണം', 'അവിട്ടം', 'ചതയം', 'പൂരുരുട്ടാതി', 'ഉത്രട്ടാതി', 'രേവതി'];
const NAKS_EN_FALLBACK = ['Ashwathi', 'Bharani', 'Karthika', 'Rohini', 'Makiryam', 'Thiruvathira', 'Punartham', 'Pooyam', 'Aayilyam', 'Makam', 'Pooram', 'Uthram', 'Atham', 'Chithra', 'Chothi', 'Vishakham', 'Anizham', 'Thrikketta', 'Moolam', 'Pooradam', 'Uthradam', 'Thiruvonam', 'Avittam', 'Chathayam', 'Poororuttathi', 'Uthrattathi', 'Revathi'];

// Returns the nakshathram list from the engine, or a static fallback.
function nakshatramList() {
    const p = getPanchangam();
    if (p && typeof p.getNakshatramList === 'function') return p.getNakshatramList();
    return NAKS_FALLBACK.map((ml, i) => ({ ml, en: NAKS_EN_FALLBACK[i], index: i }));
}

// How many upcoming days to offer as performing dates.
const DATE_COUNT = 30;
// WhatsApp renders lists in sections; we chunk long lists to keep them tidy.
const NAK_CHUNK = 9;
const DATE_CHUNK = 10;

// --- formatting helpers ---------------------------------------------------

function formatDMY(isoDate) {
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// --- list builders --------------------------------------------------------

// List of bookable vazhipadu items from the master table.
async function sendVazhipaduList(ctx) {
    const { sock, jid, session, db } = ctx;
    const rows = await db.getXbyY('SELECT id, name, price FROM vazhipadu_master');
    session.vazhipaduList = rows;

    const listRows = rows.map(r => ({
        title: String(r.name).slice(0, 24),
        rowId: `V_${r.id}`,
        description: `₹${r.price}`
    }));

    const lang = session.language;
    await sock.sendMessage(jid, {
        text: t(lang, 'vazhipadu.select_text'),
        footer: t(lang, 'common.footer'),
        title: t(lang, 'vazhipadu.select_title'),
        buttonText: t(lang, 'vazhipadu.select_button'),
        sections: [{ title: t(lang, 'vazhipadu.select_section'), rows: listRows }]
    });
}

// List of the 27 nakshathram names in Malayalam.
async function sendNakshatramList(ctx) {
    const { sock, jid, session } = ctx;
    const lang = session.language;
    const naks = nakshatramList(); // [{ ml, en, index }]
    const rows = naks.map(n => ({
        title: String(n.ml).slice(0, 24),
        rowId: `N_${n.index}`,
        description: n.en
    }));
    const sections = chunk(rows, NAK_CHUNK).map((rws, i) => ({
        title: t(lang, 'vazhipadu.nak_section', { from: i * NAK_CHUNK + 1, to: i * NAK_CHUNK + rws.length }),
        rows: rws
    }));

    await sock.sendMessage(jid, {
        text: t(lang, 'vazhipadu.nak_text'),
        footer: t(lang, 'common.footer'),
        title: t(lang, 'vazhipadu.nak_title'),
        buttonText: t(lang, 'vazhipadu.nak_button'),
        sections
    });
}

// List of the next DATE_COUNT days, each showing that day's nakshathram in Malayalam.
async function sendDateList(ctx) {
    const { sock, jid, session } = ctx;
    const lang = session.language;
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const rows = [];
    const dateMeta = {}; // isoDate -> { nakMl, weekdayMl, isNakLess } for later lookup
    for (let i = 0; i < DATE_COUNT; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const iso = d.toISOString().split('T')[0];

        let nakMl = '';
        let weekdayMl = '';
        let isNakLess = false;
        const p = getPanchangam();
        if (p) {
            try {
                const info = p.getPanchangam(iso);
                nakMl = info.nakshathram?.ml || '';
                weekdayMl = info.weekday?.ml || '';
                isNakLess = !!info.isNakshatramLess;
            } catch (e) {
                console.error('Panchangam lookup failed for', iso, e.message);
            }
        }

        dateMeta[iso] = { nakMl, weekdayMl, isNakLess };
        const nakLabel = isNakLess ? t(lang, 'vazhipadu.date_nak_less') : nakMl;
        const desc = [weekdayMl, nakLabel].filter(Boolean).join(' · ') || t(lang, 'vazhipadu.date_no_info');
        rows.push({ title: formatDMY(iso), rowId: `D_${iso}`, description: desc.slice(0, 72) });
    }
    session.dateMeta = dateMeta;

    const sections = chunk(rows, DATE_CHUNK).map((rws, i) => ({
        title: t(lang, 'vazhipadu.date_section', { from: i * DATE_CHUNK + 1, to: i * DATE_CHUNK + rws.length }),
        rows: rws
    }));

    await sock.sendMessage(jid, {
        text: t(lang, 'vazhipadu.date_text'),
        footer: t(lang, 'common.footer'),
        title: t(lang, 'vazhipadu.date_title'),
        buttonText: t(lang, 'vazhipadu.date_button'),
        sections
    });
}

// Ask whether the devotee wants to add another vazhipadu (Yes/No buttons).
async function sendAddMorePrompt(ctx) {
    const { sock, jid, session } = ctx;
    const lang = session.language;
    await sock.sendMessage(jid, {
        text: t(lang, 'vazhipadu.add_more_text'),
        footer: t(lang, 'common.footer'),
        buttons: [
            { id: 'ADDMORE_YES', text: t(lang, 'vazhipadu.add_more_yes') },
            { id: 'ADDMORE_NO', text: t(lang, 'vazhipadu.add_more_no') }
        ]
    });
}

// Show the booking summary with Confirm/Cancel buttons.
async function sendSummary(ctx) {
    const { sock, jid, session } = ctx;
    const lang = session.language;
    let total = 0;
    const lines = [t(lang, 'vazhipadu.summary_title'), ''];
    session.bookings.forEach((b, i) => {
        lines.push(t(lang, 'vazhipadu.summary_item', {
            n: i + 1, name: b.name, devotee: b.devoteeName, nak: b.nakshathram, date: b.date, price: b.price
        }));
        lines.push('');
        total += b.price;
    });
    lines.push(t(lang, 'vazhipadu.summary_total', { total }));
    session.totalAmount = total;

    await sock.sendMessage(jid, {
        text: lines.join('\n'),
        footer: t(lang, 'vazhipadu.summary_footer'),
        buttons: [
            { id: 'CONFIRM_BOOKING', text: t(lang, 'vazhipadu.confirm') },
            { id: 'CANCEL_BOOKING', text: t(lang, 'vazhipadu.cancel') }
        ]
    });
}

// Payment mode selection as buttons.
async function sendPaymentModePrompt(ctx) {
    const { sock, jid, session } = ctx;
    const lang = session.language;
    await sock.sendMessage(jid, {
        text: t(lang, 'vazhipadu.pay_prompt', { total: session.totalAmount }),
        footer: t(lang, 'common.footer'),
        buttons: [
            { id: 'PAY_UPI', text: t(lang, 'vazhipadu.pay_upi') },
            { id: 'PAY_COUNTER', text: t(lang, 'vazhipadu.pay_counter') }
        ]
    });
}

// --- module ---------------------------------------------------------------

module.exports = {
    option: '3',
    states: [
        STATES.VAZHIPADU_SELECT,
        STATES.VAZHIPADU_NAME,
        STATES.VAZHIPADU_NAKSHATHRAM,
        STATES.VAZHIPADU_DATE,
        STATES.VAZHIPADU_ADD_MORE,
        STATES.VAZHIPADU_CONFIRM,
        STATES.VAZHIPADU_PAYMENT_MODE
    ],

    // Entry point from the main menu.
    async start(ctx) {
        ctx.session.bookings = [];
        ctx.session.currentBooking = null;
        ctx.session.state = STATES.VAZHIPADU_SELECT;
        await sendVazhipaduList(ctx);
    },

    // Step handler, routed by session.state.
    async handle(ctx) {
        const { sock, jid, text, session, userPhone, pushName, db, payment, notify } = ctx;
        const { setXbyY } = db;
        const lang = session.language;

        switch (session.state) {
            case STATES.VAZHIPADU_SELECT: {
                // Accept both the list rowId ("V_5") and a plain typed id ("5").
                const id = text.startsWith('V_') ? text.slice(2) : text;
                const selected = (session.vazhipaduList || []).find(v => v.id == id);
                if (!selected) return sock.sendMessage(jid, { text: t(lang, 'vazhipadu.invalid_select') });
                session.currentBooking = { id: selected.id, name: selected.name, price: selected.price };
                session.state = STATES.VAZHIPADU_NAME;
                await sock.sendMessage(jid, { text: t(lang, 'vazhipadu.you_selected', { name: selected.name }) });
                break;
            }

            case STATES.VAZHIPADU_NAME:
                session.currentBooking.devoteeName = text;
                session.state = STATES.VAZHIPADU_NAKSHATHRAM;
                await sendNakshatramList(ctx);
                break;

            case STATES.VAZHIPADU_NAKSHATHRAM: {
                // Accept the list rowId ("N_4"), a typed 1-based number, or the ml name.
                const naks = nakshatramList();
                let picked;
                if (text.startsWith('N_')) {
                    picked = naks.find(n => String(n.index) === text.slice(2));
                } else if (/^\d+$/.test(text)) {
                    picked = naks[parseInt(text, 10) - 1];
                } else {
                    picked = naks.find(n => n.ml === text || n.en.toLowerCase() === text.toLowerCase());
                }
                if (!picked) return sock.sendMessage(jid, { text: t(lang, 'vazhipadu.invalid_nak') });
                session.currentBooking.nakshathram = picked.ml;
                session.state = STATES.VAZHIPADU_DATE;
                await sendDateList(ctx);
                break;
            }

            case STATES.VAZHIPADU_DATE: {
                // Accept the list rowId ("D_2026-07-20") or a typed ISO date.
                const iso = text.startsWith('D_') ? text.slice(2) : text;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
                    return sock.sendMessage(jid, { text: t(lang, 'vazhipadu.invalid_date') });
                }
                session.currentBooking.date = formatDMY(iso);
                session.currentBooking.dateIso = iso;
                session.bookings.push(session.currentBooking);
                session.currentBooking = null;
                session.state = STATES.VAZHIPADU_ADD_MORE;
                await sendAddMorePrompt(ctx);
                break;
            }

            case STATES.VAZHIPADU_ADD_MORE: {
                const answer = text.toUpperCase();
                if (answer === 'ADDMORE_YES' || answer === 'YES' || answer === 'Y') {
                    session.state = STATES.VAZHIPADU_SELECT;
                    await sendVazhipaduList(ctx);
                } else if (answer === 'ADDMORE_NO' || answer === 'NO' || answer === 'N') {
                    session.state = STATES.VAZHIPADU_CONFIRM;
                    await sendSummary(ctx);
                } else {
                    await sock.sendMessage(jid, { text: t(lang, 'vazhipadu.add_more_invalid') });
                }
                break;
            }

            case STATES.VAZHIPADU_CONFIRM: {
                const answer = text.toUpperCase();
                if (answer === 'CONFIRM_BOOKING' || answer === 'CONFIRM') {
                    session.state = STATES.VAZHIPADU_PAYMENT_MODE;
                    await sendPaymentModePrompt(ctx);
                } else if (answer === 'CANCEL_BOOKING' || answer === 'CANCEL') {
                    session.bookings = [];
                    session.currentBooking = null;
                    session.state = STATES.IDLE;
                    await sock.sendMessage(jid, { text: t(lang, 'vazhipadu.cancelled') });
                } else {
                    await sock.sendMessage(jid, { text: t(lang, 'vazhipadu.confirm_invalid') });
                }
                break;
            }

            case STATES.VAZHIPADU_PAYMENT_MODE: {
                const mode = text.toUpperCase();
                if (mode === 'PAY_UPI' || text === '1') {
                    await sock.sendMessage(jid, { text: t(lang, 'vazhipadu.generating_qr') });
                    payment.generateUPIPayment(jid, session.totalAmount, sock, 'VAZHIPADU', async (order_id) => {
                        let receipt = t(lang, 'vazhipadu.receipt_paid', { order_id });
                        let admin = adminMsg('vazhipadu_paid_header', { order_id, phone: userPhone, name: pushName || 'N/A', total: session.totalAmount });
                        for (let b of session.bookings) {
                            await setXbyY(`INSERT INTO vazhipadu_bookings (order_id, phone_number, vazhipadu_name, devotee_name, nakshathram, performing_date, amount, payment_mode, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'UPI', 'CONFIRMED')`, [order_id, userPhone, b.name, b.devoteeName, b.nakshathram, b.date, b.price]);
                            receipt += t(lang, 'vazhipadu.receipt_line', { name: b.name, devotee: b.devoteeName, date: b.date }) + '\n';
                            admin += adminMsg('vazhipadu_line', { name: b.name, devotee: b.devoteeName, nak: b.nakshathram, date: b.date, price: b.price });
                        }
                        receipt += t(lang, 'vazhipadu.receipt_thanks');
                        await sock.sendMessage(jid, { text: receipt });
                        await notify.notifyAdmin(sock, admin);
                        session.state = STATES.IDLE;
                    }, lang);
                } else if (mode === 'PAY_COUNTER' || text === '2') {
                    let order_id = `COUNTER_${Date.now()}`;
                    let receipt = t(lang, 'vazhipadu.receipt_counter', { order_id, total: session.totalAmount });
                    let admin = adminMsg('vazhipadu_counter_header', { order_id, phone: userPhone, name: pushName || 'N/A', total: session.totalAmount });
                    for (let b of session.bookings) {
                        await setXbyY(`INSERT INTO vazhipadu_bookings (order_id, phone_number, vazhipadu_name, devotee_name, nakshathram, performing_date, amount, payment_mode, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'COUNTER', 'PENDING')`, [order_id, userPhone, b.name, b.devoteeName, b.nakshathram, b.date, b.price]);
                        receipt += t(lang, 'vazhipadu.receipt_line', { name: b.name, devotee: b.devoteeName, date: b.date }) + '\n';
                        admin += adminMsg('vazhipadu_line', { name: b.name, devotee: b.devoteeName, nak: b.nakshathram, date: b.date, price: b.price });
                    }
                    await sock.sendMessage(jid, { text: receipt });
                    await notify.notifyAdmin(sock, admin);
                    session.state = STATES.IDLE;
                } else {
                    await sock.sendMessage(jid, { text: t(lang, 'vazhipadu.pay_invalid') });
                }
                break;
            }
        }
    }
};
