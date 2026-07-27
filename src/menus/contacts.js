// Option 6: Temple Contacts — list-driven flow.
// Flow: show a list of contact types -> on selection, show that contact's
//       details with "Back to Contacts" and "Main Menu" buttons.
// Contact details are mock data for now; edit the CONTACTS array to update them.

const { STATES } = require('../config');
const { t } = require('../i18n');
const { mainMenuButton } = require('./mainMenu');

// Contact directory. `id` is the list rowId / button id; `labelKey` is the
// i18n key for the role label. Name/phone/whatsapp/email are placeholders.
const CONTACTS = [
    {
        id: 'CONTACT_PRIEST',
        labelKey: 'contacts.role_priest',
        name: 'Sri Babu Perumana',
        phone: '+91 72939 59595',
        whatsapp: '+91 89079 59595',
        email: 'babuperumana@gmail.com'
    },
    {
        id: 'CONTACT_COUNTER',
        labelKey: 'contacts.role_counter',
        name: 'Sri Krishnan Thravot',
        phone: '+91 90746 22659',
        whatsapp: '+91 90746 22659',
        email: 'counter@kaippullitemple.online'
    },
    {
        id: 'CONTACT_PRESIDENT',
        labelKey: 'contacts.role_president',
        name: 'Sri Ajeesh',
        phone: '+91 99468 44987',
        whatsapp: '+91 99468 44987',
        email: 'president@kaippullitemple.online'
    },
    {
        id: 'CONTACT_SECRETARY',
        labelKey: 'contacts.role_secretary',
        name: 'Sri Vasudevan Nambeesan',
        phone: '+91 94958 86473',
        whatsapp: '+91 94958 86473',
        email: 'secretary@kaippullitemple.online'
    }
];

// rowId used by the "Back to Contacts" button.
const BACK_ID = 'CONTACT_BACK';

// Send the list of contact types.
async function sendContactList({ sock, jid, session }) {
    const lang = session.language;
    const rows = CONTACTS.map(c => ({
        title: t(lang, c.labelKey),
        rowId: c.id
    }));
    await sock.sendMessage(jid, {
        text: t(lang, 'contacts.list_text'),
        footer: t(lang, 'common.footer'),
        title: t(lang, 'contacts.list_title'),
        buttonText: t(lang, 'contacts.list_button'),
        sections: [{ title: t(lang, 'contacts.list_section'), rows }]
    });
}

// Send one contact's details with navigation buttons.
async function sendContactDetail({ sock, jid, session }, contact) {
    const lang = session.language;
    await sock.sendMessage(jid, {
        text: t(lang, 'contacts.detail', {
            role: t(lang, contact.labelKey),
            name: contact.name,
            phone: contact.phone,
            whatsapp: contact.whatsapp,
            email: contact.email
        }),
        footer: t(lang, 'common.footer'),
        buttons: [
            { id: BACK_ID, text: t(lang, 'contacts.back_button') },
            mainMenuButton(lang)
        ]
    });
}

module.exports = {
    option: '6',
    states: [STATES.CONTACT_SELECT],

    // Entry point from the main menu.
    async start(ctx) {
        ctx.session.state = STATES.CONTACT_SELECT;
        await sendContactList(ctx);
    },

    // Step handler, routed by session.state.
    async handle(ctx) {
        const { text, session } = ctx;
        const lang = session.language;

        // "Back to Contacts" re-shows the list.
        if (text.toUpperCase() === BACK_ID) {
            return sendContactList(ctx);
        }

        // Match the selected contact by rowId/button id.
        const selected = CONTACTS.find(c => c.id === text.toUpperCase());
        if (!selected) {
            return ctx.sock.sendMessage(ctx.jid, { text: t(lang, 'contacts.invalid_select') });
        }
        await sendContactDetail(ctx, selected);
    }
};
