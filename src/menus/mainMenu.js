// Main menu as an interactive WhatsApp list message, built per language.
// Each rowId maps to a menu module registered in ./index.js.

const { t } = require('../i18n');

// Build the localized main menu for a given devotee language.
function buildMainMenu(language) {
    return {
        text: t(language, 'main_menu.text'),
        footer: t(language, 'common.footer'),
        title: t(language, 'main_menu.title'),
        buttonText: t(language, 'main_menu.button'),
        sections: [
            {
                title: t(language, 'main_menu.section'),
                rows: [
                    { title: t(language, 'main_menu.row_timings'), rowId: '1', description: t(language, 'main_menu.row_timings_desc') },
                    { title: t(language, 'main_menu.row_deities'), rowId: '2', description: t(language, 'main_menu.row_deities_desc') },
                    { title: t(language, 'main_menu.row_vazhipadu'), rowId: '3', description: t(language, 'main_menu.row_vazhipadu_desc') },
                    { title: t(language, 'main_menu.row_donation'), rowId: '4', description: t(language, 'main_menu.row_donation_desc') },
                    { title: t(language, 'main_menu.row_location'), rowId: '5', description: t(language, 'main_menu.row_location_desc') },
                    { title: t(language, 'main_menu.row_contacts'), rowId: '6', description: t(language, 'main_menu.row_contacts_desc') },
                    { title: t(language, 'main_menu.row_specialdays'), rowId: '7', description: t(language, 'main_menu.row_specialdays_desc') },
                    { title: t(language, 'main_menu.row_settings'), rowId: '8', description: t(language, 'main_menu.row_settings_desc') }
                ]
            }
        ]
    };
}

// A single "Main Menu" button. Its id '0' is handled by the router in
// whatsappBot.js, which rebuilds the main menu.
function mainMenuButton(language) {
    return { id: '0', text: t(language, 'common.main_menu_button') };
}

module.exports = { buildMainMenu, mainMenuButton };
