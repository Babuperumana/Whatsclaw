// Devotee onboarding: first-time visitors pick a language and get registered
// in the `devotees` table before they reach the main menu.
//
// Also reused by Settings (option 7) to let an existing devotee change their
// language. In that case the caller passes { isSettings: true } on the session
// so we update the row and return to the menu instead of treating it as a
// first-time registration.

const { STATES } = require('../config');
const { t } = require('../i18n');

// Supported languages. `id` is the list rowId; `name` is stored; `label` shows
// each language in its own script so a new devotee can recognise it.
const LANGUAGES = [
    { id: 'LANG_MALAYALAM', name: 'Malayalam', label: 'മലയാളം (Malayalam)' },
    { id: 'LANG_ENGLISH', name: 'English', label: 'English' },
    { id: 'LANG_TAMIL', name: 'Tamil', label: 'தமிழ் (Tamil)' },
    { id: 'LANG_HINDI', name: 'Hindi', label: 'हिन्दी (Hindi)' }
];

// Returns the devotee row for a phone number, or null if not registered.
async function findDevotee(db, phone_number) {
    const rows = await db.getXbyY(
        'SELECT * FROM devotees WHERE phone_number = ?',
        [phone_number]
    );
    return rows[0] || null;
}

// Language selection list message. `language` picks the surrounding text's
// language: null/undefined for first-time devotees (defaults to English via
// the i18n fallback), or the devotee's current language when changing it.
async function sendLanguagePrompt({ sock, jid, session }) {
    const language = session && session.language; // undefined for new devotees
    await sock.sendMessage(jid, {
        text: session && session.isSettings
            ? t(language, 'settings.text')
            : t(language, 'onboarding.welcome'),
        footer: t(language, 'common.footer'),
        title: t(language, 'onboarding.title'),
        buttonText: t(language, 'onboarding.button'),
        sections: [
            {
                title: t(language, 'onboarding.section'),
                rows: LANGUAGES.map(l => ({ title: l.label, rowId: l.id }))
            }
        ]
    });
}

module.exports = {
    // Not registered under `option` — this is driven from the bot entry point,
    // not the main menu. Exposed so the registry wires up the state handler.
    states: [STATES.LANGUAGE_SELECT],
    LANGUAGES,
    findDevotee,
    sendLanguagePrompt,

    // Begin onboarding for a new devotee.
    async start(ctx) {
        ctx.session.state = STATES.LANGUAGE_SELECT;
        await sendLanguagePrompt(ctx);
    },

    // Handle the language selection and register (or update) the devotee.
    async handle(ctx) {
        const { sock, jid, text, session, userPhone, pushName, db } = ctx;

        // Accept the list rowId, a typed 1-4, or the language name.
        let picked = LANGUAGES.find(l => l.id === text.toUpperCase());
        if (!picked && /^[1-4]$/.test(text)) picked = LANGUAGES[parseInt(text, 10) - 1];
        if (!picked) picked = LANGUAGES.find(l => l.name.toLowerCase() === text.toLowerCase());
        if (!picked) {
            await sendLanguagePrompt(ctx);
            return null;
        }

        // Register (or update, if the row already exists) the devotee.
        await db.setXbyY(
            `INSERT INTO devotees (phone_number, whatsapp_name, language) VALUES (?, ?, ?)
             ON CONFLICT(phone_number) DO UPDATE SET whatsapp_name = excluded.whatsapp_name, language = excluded.language`,
            [userPhone, pushName || null, picked.name]
        );

        session.language = picked.name;
        session.state = STATES.IDLE;
        session.isSettings = false;

        // Send a welcome message that includes the opt-out info.
        const optOutInfo = {
            'Malayalam': '\n\n💡 ഓട്ടോമാറ്റഡ് അറിയിപ്പുകൾ നിര്‍ത്താൻ "STOP" ടൈപ്പ് ചെയ്യുക.',
            'Tamil': '\n\n💡 ஆட்டோமேட்டிக் ஹட்சலை நிறுத்த "STOP" ஐ அழுத்தவும்.',
            'Hindi': '\n\n💡 ऑटोमेटिक रिमाइंडर बंद करने के लिए "STOP" टाइप करें.',
            'English': '\n\n💡 Type "STOP" anytime to disable automated reminders.'
        };

        const welcome = t(picked.name, 'onboarding.language_set', { name: picked.name });
        await sock.sendMessage(jid, { text: welcome + (optOutInfo[picked.name] || optOutInfo['English']) });
        return picked;
    }
};
