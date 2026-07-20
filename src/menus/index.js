// Menu registry. To add a new menu:
//   1. Create a file in this folder exposing { option, start, [states, handle] }.
//   2. require() it and add it to the `menus` array below.
//   3. Add a matching row (rowId = option) in mainMenu.js.

const timings = require('./timings');
const deities = require('./deities');
const vazhipadu = require('./vazhipadu');
const donation = require('./donation');
const location = require('./location');
const contacts = require('./contacts');
const specialdays = require('./specialdays');
const settings = require('./settings');
const onboarding = require('./onboarding');

const menus = [timings, deities, vazhipadu, donation, location, contacts, specialdays, settings, onboarding];

// option number -> menu module (used from the main menu / IDLE state)
const byOption = {};
// conversation state -> menu module that owns it (used mid-flow)
const byState = {};

for (const menu of menus) {
    if (menu.option) byOption[menu.option] = menu;
    for (const state of menu.states || []) {
        byState[state] = menu;
    }
}

module.exports = { menus, byOption, byState };
