// Option 4: Temple Donation — multi-step flow.
// Owns the DONATION_* states and handles each step.

const { STATES } = require('../config');
const { t } = require('../i18n');
const { adminMsg } = require('../i18n/admin');
const { generateOrderId } = require('../utils/orderId');

// Donation purposes. `id` is the button id; `name` is the canonical value
// stored in the DB and sent to the admin (kept in English for consistency);
// `labelKey` is the i18n key for the devotee-facing label.
const PURPOSES = [
    { id: 'DON_ANNADANAM', name: 'Annadanam', labelKey: 'donation.purpose_annadanam' },
    { id: 'DON_RENOVATION', name: 'Temple Renovation', labelKey: 'donation.purpose_renovation' },
    { id: 'DON_EVENTS', name: 'Upcoming Events', labelKey: 'donation.purpose_events' }
];

// Devotee-facing label for a stored purpose name, in their language.
function purposeLabel(language, name) {
    const p = PURPOSES.find(x => x.name === name);
    return p ? t(language, p.labelKey) : name;
}

// Ask the donor to pick a purpose (buttons).
async function sendPurposePrompt({ sock, jid, session }) {
    const lang = session.language;
    await sock.sendMessage(jid, {
        text: t(lang, 'donation.purpose_text'),
        footer: t(lang, 'common.footer'),
        buttons: PURPOSES.map(p => ({ id: p.id, text: t(lang, p.labelKey) }))
    });
}

// Ask for payment mode (buttons).
async function sendPaymentModePrompt({ sock, jid, session }) {
    const lang = session.language;
    await sock.sendMessage(jid, {
        text: t(lang, 'donation.pay_prompt', {
            purpose: purposeLabel(lang, session.donationPurpose),
            amount: session.donationAmount
        }),
        footer: t(lang, 'common.footer'),
        buttons: [
            { id: 'PAY_UPI', text: t(lang, 'donation.pay_upi') },
            { id: 'PAY_COUNTER', text: t(lang, 'donation.pay_counter') }
        ]
    });
}

module.exports = {
    option: '4',
    states: [
        STATES.DONATION_PURPOSE,
        STATES.DONATION_AMOUNT,
        STATES.DONATION_PAYMENT_MODE
    ],

    // Entry point from the main menu.
    async start(ctx) {
        ctx.session.state = STATES.DONATION_PURPOSE;
        await sendPurposePrompt(ctx);
    },

    // Step handler, routed by session.state.
    async handle(ctx) {
        const { sock, jid, text, session, userPhone, pushName, db, payment, notify } = ctx;
        const { getXbyY, setXbyY } = db;
        const lang = session.language;

        switch (session.state) {
            case STATES.DONATION_PURPOSE: {
                // Accept the button id or a typed number/name.
                let picked = PURPOSES.find(p => p.id === text.toUpperCase());
                if (!picked && /^[1-3]$/.test(text)) picked = PURPOSES[parseInt(text, 10) - 1];
                if (!picked) picked = PURPOSES.find(p => p.name.toLowerCase() === text.toLowerCase());
                if (!picked) {
                    return sock.sendMessage(jid, { text: t(lang, 'donation.pick_purpose') });
                }
                session.donationPurpose = picked.name;
                session.state = STATES.DONATION_AMOUNT;
                await sock.sendMessage(jid, { text: t(lang, 'donation.selected_purpose', { name: t(lang, picked.labelKey) }) });
                break;
            }

            case STATES.DONATION_AMOUNT: {
                const amount = parseFloat(text);
                if (isNaN(amount) || amount <= 0) return sock.sendMessage(jid, { text: t(lang, 'donation.invalid_amount') });
                session.donationAmount = amount;
                session.state = STATES.DONATION_PAYMENT_MODE;
                await sendPaymentModePrompt(ctx);
                break;
            }

            case STATES.DONATION_PAYMENT_MODE: {
                const mode = text.toUpperCase();
                const purposeDisplay = purposeLabel(lang, session.donationPurpose);
                if (mode === 'PAY_UPI' || text === '1') {
                    const order_id = await generateOrderId('D', getXbyY);
                    await sock.sendMessage(jid, { text: t(lang, 'donation.generating_qr') });
                    payment.generateUPIPayment(jid, session.donationAmount, sock, order_id, async (order_id) => {
                        await setXbyY(`INSERT INTO donations_payment_details (order_id, phone_number, whatsapp_name, amount, purpose, payment_mode, status) VALUES (?, ?, ?, ?, ?, 'UPI', 'CONFIRMED')`, [order_id, userPhone, pushName, session.donationAmount, session.donationPurpose]);
                        const receipt = t(lang, 'donation.receipt_paid', { order_id, purpose: purposeDisplay, amount: session.donationAmount });
                        await sock.sendMessage(jid, { text: receipt });
                        await notify.notifyAdmin(sock, adminMsg('donation_paid', { order_id, phone: userPhone, name: pushName || 'N/A', purpose: session.donationPurpose, amount: session.donationAmount }));
                        session.state = STATES.IDLE;
                    }, lang);
                } else if (mode === 'PAY_COUNTER' || text === '2') {
                    const order_id = await generateOrderId('D', getXbyY);
                    await setXbyY(`INSERT INTO donations_payment_details (order_id, phone_number, whatsapp_name, amount, purpose, payment_mode, status) VALUES (?, ?, ?, ?, ?, 'COUNTER', 'PENDING')`, [order_id, userPhone, pushName, session.donationAmount, session.donationPurpose]);
                    const receipt = t(lang, 'donation.receipt_counter', { order_id, purpose: purposeDisplay, amount: session.donationAmount });
                    await sock.sendMessage(jid, { text: receipt });
                    await notify.notifyAdmin(sock, adminMsg('donation_counter', { order_id, phone: userPhone, name: pushName || 'N/A', purpose: session.donationPurpose, amount: session.donationAmount }));
                    session.state = STATES.IDLE;
                } else {
                    await sock.sendMessage(jid, { text: t(lang, 'donation.pay_invalid') });
                }
                break;
            }
        }
    }
};
