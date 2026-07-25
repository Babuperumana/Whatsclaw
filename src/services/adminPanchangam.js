// Builds a formatted WhatsApp Panchangam report for tomorrow's date.
// Uses the temple's native Panchangam engine (myassets/js/panchangam).
//
// The result is sent to the admin's WhatsApp number by the reminder scheduler.

const { getPanchangam } = require('../../myassets/js/panchangam');
const { t } = require('../i18n');

// Temple coordinates — must match the ones used in panchangam.js / the venue.
const LAT = 11.074462304803008;
const LNG = 76.28244022235538;

// Human-readable weekday names.
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_ML = ['ഞായറ്', 'തിങ്കൾ', 'ചൊവ്വ', 'ബുധൻ', 'വ്യാഴം', 'വെള്ളി', 'ശനി'];

function pickLangValue(obj, lang) {
    if (!obj) return null;
    if (lang === 'Malayalam') return obj.ml || obj.en;
    return obj.en || obj.ml || null;
}

/**
 * Returns tomorrow's ISO date string (YYYY-MM-DD), computed in IST.
 */
function tomorrowIso() {
    const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    ist.setDate(ist.getDate() + 1);
    const y = ist.getFullYear();
    const m = String(ist.getMonth() + 1).padStart(2, '0');
    const d = String(ist.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Build a complete Panchangam WhatsApp text for the given ISO date.
 * Falls back gracefully if the engine is unavailable.
 *
 * @param {string} isoDate - 'YYYY-MM-DD'
 * @param {string} language - devotee language name (e.g. 'English', 'Malayalam')
 * @returns {{ text: string }} formatted message
 */
function buildPanchangamMessage(isoDate, language) {
    const lang = language || 'English';
    const t_ = (key, params) => t(lang, `admin_panchangam.${key}`, params);

    const date = new Date(isoDate + 'T12:00:00');
    const isML = lang === 'Malayalam';
    const dayName = isML ? (WEEKDAY_ML[date.getDay()] || WEEKDAY_EN[date.getDay()]) : WEEKDAY_EN[date.getDay()];

    // Try the Panchangam engine; if it fails we send a simplified report.
    let pan;
    try {
        pan = getPanchangam(isoDate, LAT, LNG);
    } catch (e) {
        console.error('[adminPanchangam] engine failed:', e.message);
        return {
            text: t_('header') + '\n\n'
                + t_('date_label', { gregorian: isoDate, weekday: dayName })
                + '\n' + t_('footer')
        };
    }

    if (!pan) {
        return {
            text: t_('header') + '\n\n'
                + t_('date_label', { gregorian: isoDate, weekday: dayName })
                + '\n' + t_('footer')
        };
    }

    // Format Gregorian date as DD/MM/YYYY for readability.
    const [y, m, d] = isoDate.split('-');
    const gregorian = `${d}/${m}/${y}`;

    const nak = pickLangValue(pan.nakshathram, lang);
    const tithiName = isML ? (pan.tithi && pan.tithi.nameMl ? pan.tithi.nameMl : (pan.tithi ? pan.tithi.name : 'N/A')) : (pan.tithi ? pan.tithi.name : 'N/A');
    const paksha = pan.tithi && pan.tithi.paksha ? (isML ? (pan.tithi.pakshaMl || pan.tithi.paksha) : pan.tithi.paksha) : '';
    const yoga = pickLangValue(pan.yoga, lang);
    const karana = pickLangValue(pan.karana, lang);
    const sunrise = pan.sunrise || 'N/A';
    const sunset = pan.sunset || 'N/A';

    // Auspicious / inauspicious timings.
    const rahu = pan.timings && pan.timings.rahukalam ? pan.timings.rahukalam : 'N/A';
    const yama = pan.timings && pan.timings.yamagandam ? pan.timings.yamagandam : 'N/A';
    const gulika = pan.timings && pan.timings.gulika ? pan.timings.gulika : 'N/A';

    // Special events (festivals, vishesham) from the engine.
    const vishesham = pan.vishesham && pan.vishesham.length
        ? pan.vishesham.join(', ')
        : null;

    // Malayalam date.
    const malMonth = pan.kollavarsham
        ? (isML ? (pan.kollavarsham.monthMl || pan.kollavarsham.month || 'N/A') : (pan.kollavarsham.month || pan.kollavarsham.monthMl || 'N/A'))
        : 'N/A';
    const malDay = pan.kollavarsham && pan.kollavarsham.day ? pan.kollavarsham.day : 'N/A';
    const malYear = pan.kollavarsham && pan.kollavarsham.year ? pan.kollavarsham.year : 'N/A';

    const lines = [];
    lines.push(t_('header'));
    lines.push('');
    lines.push(t_('date_label', { gregorian, weekday: dayName }));
    lines.push(t_('malayalam_label', { month: malMonth, day: malDay, year: malYear }));

    // --- Detailed 24-hour Nakshatram breakdown ---
    lines.push(t_('nakshathram_section'));
    if (pan.nakshatramDetails && pan.nakshatramDetails.length > 0) {
        for (const seg of pan.nakshatramDetails) {
            const segName = pickLangValue(seg.nakshatram, lang);
            const start = seg.start || '';
            const end = seg.end || '';
            lines.push(t_('nakshathram_segment', { name: segName, start, end }));
        }
    } else {
        lines.push(t_('nakshathram_label', { nak: nak || 'N/A' }));
    }
    lines.push('');

    // --- Today's / Tomorrow's primary Nakshatram ---
    lines.push(t_('nakshathram_today_label'));
    if (pan.isNakshatramLess && pan.nakshatramDetails && pan.nakshatramDetails.length >= 2) {
        const prevNak = pickLangValue(pan.nakshatramDetails[0].nakshatram, lang);
        const nextNak = pickLangValue(pan.nakshatramDetails[pan.nakshatramDetails.length - 1].nakshatram, lang);
        lines.push(t_('nakshathram_less_desc'));
        lines.push(t_('nakshathram_span_label', { prev: prevNak, next: nextNak }));
    } else {
        lines.push(t_('nakshathram_simple_label', { nak: nak || 'N/A' }));
    }

    lines.push(t_('tithi_label', { tithi: tithiName, paksha }));
    lines.push(t_('yoga_label', { yoga }));
    lines.push(t_('karana_label', { karana }));
    lines.push(t_('sunrise_label', { time: sunrise }));
    lines.push(t_('sunset_label', { time: sunset }));
    lines.push(t_('rahukalam_label', { time: rahu }));
    lines.push(t_('yamagandam_label', { time: yama }));
    lines.push(t_('gulika_label', { time: gulika }));
    if (vishesham) {
        lines.push(t_('vishesham_label', { events: vishesham }));
    }
    lines.push(t_('footer'));

    return { text: lines.join('\n') };
}

module.exports = { buildPanchangamMessage, tomorrowIso };
