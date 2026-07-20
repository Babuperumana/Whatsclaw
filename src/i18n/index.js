// Centralised UI strings for the WhatsApp bot in 4 languages.
// Languages: en (English), ml (Malayalam), ta (Tamil), hi (Hindi).
//
// Usage:
//   const { t } = require('../i18n');
//   t(session.language, 'main_menu.text')
//   t(session.language, 'vazhipadu.you_selected', { name })
//
// `language` may be the stored name ('Malayalam') or a code ('ml'); both work.
// Missing keys fall back to English, then to the raw key, so the bot never
// crashes on an untranslated string.

const STRINGS = require('./strings');

// Map stored devotee language names to internal codes.
const NAME_TO_CODE = {
    english: 'en',
    malayalam: 'ml',
    tamil: 'ta',
    hindi: 'hi'
};

const DEFAULT_LANG = 'en';

// Normalise whatever we're given (name or code) to a supported code.
function langCode(language) {
    if (!language) return DEFAULT_LANG;
    const lower = String(language).toLowerCase();
    if (STRINGS[lower]) return lower;               // already a code
    if (NAME_TO_CODE[lower]) return NAME_TO_CODE[lower];
    return DEFAULT_LANG;
}

// Look up a dotted key path in a strings object.
function lookup(obj, key) {
    return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Fill {placeholders} in a template from vars.
function interpolate(str, vars) {
    if (typeof str !== 'string' || !vars) return str;
    return str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
}

// Translate a key for a language, with English + key fallback.
function t(language, key, vars) {
    const code = langCode(language);
    let val = lookup(STRINGS[code], key);
    if (val === undefined) val = lookup(STRINGS[DEFAULT_LANG], key);
    if (val === undefined) return key; // last resort: surface the key
    return interpolate(val, vars);
}

module.exports = { t, langCode, DEFAULT_LANG };
