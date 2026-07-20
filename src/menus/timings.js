// Option 1: Temple Timings (static info menu).

const { t } = require('../i18n');
const { mainMenuButton } = require('./mainMenu');

module.exports = {
    option: '1',
    async start({ sock, jid, session }) {
        await sock.sendMessage(jid, {
            text: t(session.language, 'timings.text'),
            footer: t(session.language, 'common.footer'),
            buttons: [mainMenuButton(session.language)]
        });
    }
};
