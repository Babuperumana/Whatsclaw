// Admin notification templates — always Malayalam, regardless of the devotee's
// chosen language (the temple staff member reads these).

const { langCode } = require('./index');

function interpolate(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
}

const ADMIN = {
    vazhipadu_paid_header: '🆕 *പുതിയ വഴിപാട് ബുക്കിംഗ് (UPI - അടച്ചു)*\n\n*ഓർഡർ ഐഡി:* {order_id}\n*ഭക്തന്റെ ഫോൺ:* {phone}\n*വാട്‌സ്ആപ്പ് പേര്:* {name}\n*ആകെ തുക:* ₹{total}\n\n*ബുക്കിംഗുകൾ:*\n',
    vazhipadu_counter_header: '🆕 *പുതിയ വഴിപാട് ബുക്കിംഗ് (കൗണ്ടറിൽ അടയ്ക്കുക - ബാക്കി)*\n\n*ഓർഡർ ഐഡി:* {order_id}\n*ഭക്തന്റെ ഫോൺ:* {phone}\n*വാട്‌സ്ആപ്പ് പേര്:* {name}\n*ആകെ തുക:* ₹{total}\n\n*ബുക്കിംഗുകൾ:*\n',
    vazhipadu_line: '- {name} | ഭക്തൻ: {devotee} | നക്ഷത്രം: {nak} | തീയതി: {date} | ₹{price}\n',

    donation_paid: '🆕 *പുതിയ സംഭാവന (UPI - അടച്ചു)*\n\n*ഓർഡർ ഐഡി:* {order_id}\n*ഫോൺ:* {phone}\n*വാട്‌സ്ആപ്പ് പേര്:* {name}\n*ഉദ്ദേശ്യം:* {purpose}\n*തുക:* ₹{amount}',
    donation_counter: '🆕 *പുതിയ സംഭാവന (കൗണ്ടറിൽ അടയ്ക്കുക - ബാക്കി)*\n\n*ഓർഡർ ഐഡി:* {order_id}\n*ഫോൺ:* {phone}\n*വാട്‌സ്ആപ്പ് പേര്:* {name}\n*ഉദ്ദേശ്യം:* {purpose}\n*തുക:* ₹{amount}'
};

// Translate an admin key (Malayalam only).
function adminMsg(key, vars) {
    return interpolate(ADMIN[key] || key, vars);
}

module.exports = { adminMsg };
