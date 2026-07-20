// Option 5: Temple Location (static info menu).
// Sends a native WhatsApp map pin, then a follow-up with the Main Menu button
// (a location message cannot carry buttons of its own).

const { t } = require('../i18n');
const { mainMenuButton } = require('./mainMenu');
const { TEMPLE_LOCATION } = require('../config');

module.exports = {
    option: '5',
    async start({ sock, jid, session }) {
        const lang = session.language;

        // Native map pin — renders an actual map with the temple's exact location.
        await sock.sendMessage(jid, {
            location: {
                degreesLatitude: TEMPLE_LOCATION.latitude,
                degreesLongitude: TEMPLE_LOCATION.longitude,
                name: TEMPLE_LOCATION.name,
                address: TEMPLE_LOCATION.address
            }
        });

        // Follow-up text with details and the Main Menu button.
        await sock.sendMessage(jid, {
            text: t(lang, 'location.text'),
            footer: t(lang, 'common.footer'),
            buttons: [mainMenuButton(lang)]
        });
    }
};
