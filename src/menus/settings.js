// Option 8: Settings — a sub-menu that lets a devotee:
//   1. Change their preferred language (reuses the onboarding language flow).
//   2. View their past & upcoming vazhipadu bookings.
//   3. View their registered nakshathra poojas with the next pooja date
//      (computed live from myassets/js/panchangam.js).

const { STATES } = require('../config');
const { t } = require('../i18n');
const { mainMenuButton } = require('./mainMenu');
const onboarding = require('./onboarding');

// panchangam pulls in a native calendar engine; load it lazily and tolerate its
// absence so the bot still boots (next-pooja dates just won't resolve).
let panchangam = null;
let panchangamError = null;
function getPanchangam() {
    if (panchangam || panchangamError) return panchangam;
    try {
        panchangam = require('../../myassets/js/panchangam');
    } catch (e) {
        panchangamError = e;
        console.error('⚠️  panchangam module unavailable, next-pooja dates disabled:', e.message);
    }
    return panchangam;
}

// Sub-menu row ids.
const OPT_LANGUAGE = 'SET_LANGUAGE';
const OPT_VAZHIPADU = 'SET_VAZHIPADU';
const OPT_NAKSHATHRA = 'SET_NAKSHATHRA';

// Render a stored date as DD/MM/YYYY. Bookings store performing_date already as
// DD/MM/YYYY, while the panchangam engine returns ISO YYYY-MM-DD — handle both.
function formatDMY(date) {
    if (!date) return '';
    const s = String(date).split('T')[0];
    if (s.includes('/')) return s;                 // already DD/MM/YYYY
    const [y, m, d] = s.split('-');
    return d && m && y ? `${d}/${m}/${y}` : s;
}

function todayIso() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
}

// Normalise a stored date to a sortable ISO key (YYYY-MM-DD) so DD/MM/YYYY and
// ISO values can be compared consistently.
function toIsoKey(date) {
    if (!date) return '';
    const s = String(date).split('T')[0];
    if (s.includes('/')) {
        const [d, m, y] = s.split('/');
        return d && m && y ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : s;
    }
    return s;
}

// --- sub-menu list --------------------------------------------------------

async function sendSettingsMenu(ctx) {
    const { sock, jid, session } = ctx;
    const lang = session.language;
    await sock.sendMessage(jid, {
        text: t(lang, 'settings.menu_text'),
        footer: t(lang, 'common.footer'),
        title: t(lang, 'settings.menu_title'),
        buttonText: t(lang, 'settings.menu_button'),
        sections: [
            {
                title: t(lang, 'settings.menu_section'),
                rows: [
                    { title: t(lang, 'settings.opt_language'), rowId: OPT_LANGUAGE, description: t(lang, 'settings.opt_language_desc') },
                    { title: t(lang, 'settings.opt_vazhipadu'), rowId: OPT_VAZHIPADU, description: t(lang, 'settings.opt_vazhipadu_desc') },
                    { title: t(lang, 'settings.opt_nakshathra'), rowId: OPT_NAKSHATHRA, description: t(lang, 'settings.opt_nakshathra_desc') }
                ]
            }
        ]
    });
}

// --- views ----------------------------------------------------------------

// Past & upcoming vazhipadu bookings for the devotee's number.
async function showVazhipadus(ctx) {
    const { sock, jid, session, userPhone, db } = ctx;
    const lang = session.language;

    const rows = await db.getXbyY(
        `SELECT vazhipadu_name, devotee_name, nakshathram, performing_date, status
         FROM vazhipadu_bookings WHERE phone_number = ? ORDER BY performing_date ASC`,
        [userPhone]
    );

    if (!rows.length) {
        await sock.sendMessage(jid, {
            text: `${t(lang, 'settings.vazhipadu_header')}\n\n${t(lang, 'settings.vazhipadu_empty')}`,
            footer: t(lang, 'common.footer'),
            buttons: [mainMenuButton(lang)]
        });
        return;
    }

    // performing_date is stored as DD/MM/YYYY, so sort/split on an ISO key
    // rather than the raw string (which the SQL ORDER BY can't order correctly).
    const today = todayIso();
    rows.sort((a, b) => toIsoKey(a.performing_date).localeCompare(toIsoKey(b.performing_date)));
    const upcoming = rows.filter(r => toIsoKey(r.performing_date) >= today);
    const past = rows.filter(r => toIsoKey(r.performing_date) < today);

    const line = r => t(lang, 'settings.vazhipadu_line', {
        name: r.vazhipadu_name,
        nak: r.nakshathram || '',
        devotee: r.devotee_name,
        date: formatDMY(r.performing_date),
        status: r.status
    });

    const parts = [t(lang, 'settings.vazhipadu_header')];
    if (upcoming.length) {
        parts.push('', t(lang, 'settings.vazhipadu_upcoming'));
        upcoming.forEach(r => parts.push(line(r)));
    }
    if (past.length) {
        parts.push('', t(lang, 'settings.vazhipadu_past'));
        past.forEach(r => parts.push(line(r)));
    }

    await sock.sendMessage(jid, {
        text: parts.join('\n'),
        footer: t(lang, 'common.footer'),
        buttons: [mainMenuButton(lang)]
    });
}

// Registered nakshathra poojas + next pooja date from the panchangam engine.
async function showNakshathraPoojas(ctx) {
    const { sock, jid, session, userPhone, db } = ctx;
    const lang = session.language;

    const rows = await db.getXbyY(
        `SELECT name, nakshathram FROM nakshathra_pooja
         WHERE whatsapp_number = ? AND status = 'ACTIVE' ORDER BY id ASC`,
        [userPhone]
    );

    if (!rows.length) {
        await sock.sendMessage(jid, {
            text: `${t(lang, 'settings.nakshathra_header')}\n\n${t(lang, 'settings.nakshathra_empty')}`,
            footer: t(lang, 'common.footer'),
            buttons: [mainMenuButton(lang)]
        });
        return;
    }

    const p = getPanchangam();
    const parts = [t(lang, 'settings.nakshathra_header'), ''];

    for (const r of rows) {
        let next = null;
        if (p && typeof p.getNextNakshatraDates === 'function') {
            try {
                const res = p.getNextNakshatraDates(r.nakshathram, 1);
                if (res && res.length) next = res[0];
            } catch (e) {
                console.error('next nakshathra date lookup failed:', e.message);
            }
        }
        if (next) {
            const weekday = (next.weekday && (lang === 'Malayalam' ? next.weekday.ml : next.weekday.en)) || '';
            parts.push(t(lang, 'settings.nakshathra_line', {
                name: r.name, nak: r.nakshathram, date: formatDMY(next.date), weekday
            }));
        } else {
            parts.push(t(lang, 'settings.nakshathra_line_nodate', { name: r.name, nak: r.nakshathram }));
        }
    }

    await sock.sendMessage(jid, {
        text: parts.join('\n'),
        footer: t(lang, 'common.footer'),
        buttons: [mainMenuButton(lang)]
    });
}

// --- module ---------------------------------------------------------------

module.exports = {
    option: '8',
    states: [STATES.SETTINGS_MENU],

    async start(ctx) {
        ctx.session.state = STATES.SETTINGS_MENU;
        await sendSettingsMenu(ctx);
    },

    async handle(ctx) {
        const { session, text } = ctx;
        const choice = text.toUpperCase();

        // Accept the list rowId or a typed 1-3.
        if (choice === OPT_LANGUAGE || text === '1') {
            // Hand off to the onboarding language flow, flagged as a settings change.
            session.isSettings = true;
            session.state = STATES.LANGUAGE_SELECT;
            await onboarding.sendLanguagePrompt(ctx);
            return;
        }
        if (choice === OPT_VAZHIPADU || text === '2') {
            session.state = STATES.IDLE;
            await showVazhipadus(ctx);
            return;
        }
        if (choice === OPT_NAKSHATHRA || text === '3') {
            session.state = STATES.IDLE;
            await showNakshathraPoojas(ctx);
            return;
        }

        // Unknown input: re-show the sub-menu.
        await ctx.sock.sendMessage(ctx.jid, { text: t(session.language, 'settings.invalid') });
        await sendSettingsMenu(ctx);
    }
};
