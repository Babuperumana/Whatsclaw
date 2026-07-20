// Translation tables. One object per language code.
// Keep keys identical across languages; English is the fallback source.

const en = require('./en');
const ml = require('./ml');
const ta = require('./ta');
const hi = require('./hi');

module.exports = { en, ml, ta, hi };
