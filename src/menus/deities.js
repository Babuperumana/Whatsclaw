// Option 2: Temple Deities (static info menu).

const { t } = require('../i18n');
const { mainMenuButton } = require('./mainMenu');

module.exports = {
    option: '2',
    async start({ sock, jid, session }) {
        await sock.sendMessage(jid, {
            text: t(session.language, 'deities.text'),
            footer: t(session.language, 'common.footer'),
            buttons: [mainMenuButton(session.language)]
        });
    }
};
