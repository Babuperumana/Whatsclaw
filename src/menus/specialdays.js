// Option 7: Special Days (static info menu).
// Merges upcoming events from the panchangam engine with manually-added rows
// from the `special_days` table, sorts by date, and shows the next 7.

const { t } = require('../i18n');
const { mainMenuButton } = require('./mainMenu');

// panchangam.js pulls in a native calendar engine. Load it lazily and tolerate
// its absence so the manual list still works even if the engine is missing.
let panchangam = null;
let panchangamError = null;
function getPanchangam() {
    if (panchangam || panchangamError) return panchangam;
    try {
        panchangam = require('../../myassets/js/panchangam');
    } catch (e) {
        panchangamError = e;
        console.error('⚠️  panchangam module unavailable, engine special days disabled:', e.message);
    }
    return panchangam;
}

// How many upcoming special days to show.
const SHOW_COUNT = 7;

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

function formatDMY(isoDate) {
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
}

// Panchangam-derived events: [{ date: 'YYYY-MM-DD', name }].
function enginedays() {
    const p = getPanchangam();
    if (!p || typeof p.getUpcomingEvents !== 'function') return [];
    try {
        // Ask for more than we need; merging with manual rows may reorder them.
        return p.getUpcomingEvents(SHOW_COUNT * 2).map(e => ({ date: e.date, name: e.event }));
    } catch (e) {
        console.error('⚠️  getUpcomingEvents failed:', e.message);
        return [];
    }
}

// Manually-added future events from the DB: [{ date, name }].
async function manualdays(db) {
    const rows = await db.getXbyY(
        'SELECT event_date, name FROM special_days WHERE event_date >= ? ORDER BY event_date ASC',
        [todayISO()]
    );
    return rows.map(r => ({ date: r.event_date, name: r.name }));
}

module.exports = {
    option: '7',

    async start(ctx) {
        const { sock, jid, session, db } = ctx;
        const lang = session.language;

        const merged = [...enginedays(), ...(await manualdays(db))]
            .filter(e => e.date >= todayISO())
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, SHOW_COUNT);

        let text = `*${t(lang, 'special_days.title')}*\n\n`;
        if (merged.length === 0) {
            text += t(lang, 'special_days.none');
        } else {
            text += merged
                .map((e, i) => t(lang, 'special_days.list_item', { n: i + 1, date: formatDMY(e.date), name: e.name }))
                .join('\n');
        }

        await sock.sendMessage(jid, {
            text,
            footer: t(lang, 'common.footer'),
            buttons: [mainMenuButton(lang)]
        });
    }
};
