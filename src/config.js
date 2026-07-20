// Shared bot configuration and conversation states.

// Admin number to receive booking/donation notifications
const ADMIN_NOTIFY_JID = '918907959595@s.whatsapp.net';

// Temple location, sent to devotees as a native WhatsApp map pin.
const TEMPLE_LOCATION = {
    latitude: 11.073219249774128,
    longitude: 76.28265414399246,
    name: 'Kaippulli Temple',
    address: 'Melattur, Kerala'
};

// Conversation states. IDLE means the user is at the main menu.
const STATES = {
    IDLE: 'IDLE',
    LANGUAGE_SELECT: 'LANGUAGE_SELECT',
    VAZHIPADU_SELECT: 'VAZHIPADU_SELECT',
    VAZHIPADU_NAME: 'VAZHIPADU_NAME',
    VAZHIPADU_NAKSHATHRAM: 'VAZHIPADU_NAKSHATHRAM',
    VAZHIPADU_DATE: 'VAZHIPADU_DATE',
    VAZHIPADU_ADD_MORE: 'VAZHIPADU_ADD_MORE',
    VAZHIPADU_CONFIRM: 'VAZHIPADU_CONFIRM',
    VAZHIPADU_PAYMENT_MODE: 'VAZHIPADU_PAYMENT_MODE',
    DONATION_PURPOSE: 'DONATION_PURPOSE',
    DONATION_AMOUNT: 'DONATION_AMOUNT',
    DONATION_PAYMENT_MODE: 'DONATION_PAYMENT_MODE',
    CONTACT_SELECT: 'CONTACT_SELECT',
    SETTINGS_MENU: 'SETTINGS_MENU'
};

module.exports = { ADMIN_NOTIFY_JID, TEMPLE_LOCATION, STATES };
