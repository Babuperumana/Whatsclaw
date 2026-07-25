// English UI strings.

module.exports = {
    common: {
        footer: 'Kaippulli Temple',
        main_menu_button: '🏠 Main Menu',
        invalid_option: "Invalid option. Reply '0' for Main Menu.",
        error: "An error occurred. Reply '0' to start over.",
        blessing: 'Thank you. May God bless you! 🙏'
    },

    main_menu: {
        text: '🙏 *Welcome to Temple Vazhipadu Booking* 🙏\n\nTap the button below to choose an option.',
        title: 'Main Menu',
        button: 'View Options',
        section: 'Temple Services',
        row_timings: 'Temple Timings',
        row_timings_desc: 'Darshan and pooja timings',
        row_deities: 'Temple Deities',
        row_deities_desc: 'Deities worshipped here',
        row_vazhipadu: 'Vazhipadu Bookings',
        row_vazhipadu_desc: 'Book an offering',
        row_donation: 'Temple Donation',
        row_donation_desc: 'Make a donation',
        row_location: 'Temple Location',
        row_location_desc: 'How to reach us',
        row_contacts: 'Temple Contacts',
        row_contacts_desc: 'Get in touch',
        row_specialdays: 'Special Days',
        row_specialdays_desc: 'Upcoming special days',
        row_settings: 'Settings',
        row_settings_desc: 'Language preferences'
    },

    special_days: {
        title: '📅 Upcoming Special Days',
        list_item: '{n}. {date} — {name}',
        none: 'No upcoming special days right now. Please check back later.'
    },

    timings: {
        text: "⏰ *Temple Timings*\nMorning: 5:30 AM - 8:30 AM\nEvening: 5:30 PM - 7:00 PM\n\n_Note: Timings may vary on festival days and special occasions._"
    },
    deities: {
        text: "🕉️ *Temple Deities*\n1. Mahavishnu (Narasimham)\n2. Vettekkaran\n3. Bhagavathi\n4. Ayyappan\n5. Ganapathi\n6. Nagas"
    },
    location: {
        text: "📍 *Location*\nMelattur, Kerala\nTap the map above for directions."
    },
    contacts: {
        list_text: '📞 *Temple Contacts*\n\nTap below to choose who you want to reach.',
        list_title: 'Temple Contacts',
        list_button: 'View Contacts',
        list_section: 'Contacts',
        role_priest: 'Temple Priest',
        role_counter: 'Temple Counter',
        role_president: 'Temple President',
        role_secretary: 'Temple Secretary',
        detail: '📞 *{role}*\n\n👤 Name: {name}\n📱 Phone: {phone}\n💬 WhatsApp: {whatsapp}\n✉️ Email: {email}',
        back_button: '🔙 Contacts',
        invalid_select: 'Invalid selection. Please pick a contact from the list.'
    },

    onboarding: {
        welcome: '🙏 *Welcome to Kaippulli Temple* 🙏\n\nPlease choose your preferred language to continue.',
        title: 'Select Language',
        button: 'Choose Language',
        section: 'Languages',
        language_set: '✅ Language set to *{name}*.',
        pick_language: 'Please tap one of the language options.'
    },

    settings: {
        // Legacy key kept for the language prompt reused from onboarding.
        text: '⚙️ *Settings*\n\nChoose your preferred language below.',
        // Sub-menu shown when the devotee opens Settings.
        menu_text: '⚙️ *Settings*\n\nWhat would you like to do?',
        menu_title: 'Settings',
        menu_button: 'Open Settings',
        menu_section: 'Options',
        opt_language: 'Change Language',
        opt_language_desc: 'Set your preferred language',
        opt_vazhipadu: 'My Vazhipadus',
        opt_vazhipadu_desc: 'View past & upcoming bookings',
        opt_nakshathra: 'My Nakshathra Poojas',
        opt_nakshathra_desc: 'Upcoming pooja dates',
        invalid: 'Invalid option. Please pick one from the list.',
        // Vazhipadu history view.
        vazhipadu_header: '🌺 *My Vazhipadus*',
        vazhipadu_upcoming: '*Upcoming*',
        vazhipadu_past: '*Past*',
        vazhipadu_line: '• {name} ({nak}) — {devotee} ({date}) — {status}',
        vazhipadu_empty: 'You have no vazhipadu bookings yet.',
        // Nakshathra pooja view.
        nakshathra_header: '🕉️ *My Nakshathra Poojas*',
        nakshathra_line: '• {name} — {nak}\n  Next pooja: {date} ({weekday})',
        nakshathra_line_nodate: '• {name} — {nak}\n  Next pooja date unavailable',
        nakshathra_empty: 'No nakshathra poojas are registered for your number.'
    },

    vazhipadu: {
        select_text: '🌺 *Select a Vazhipadu* 🌺\n\nTap below to choose an offering.',
        select_title: 'Vazhipadu Items',
        select_button: 'View Vazhipadu',
        select_section: 'Available Vazhipadu',
        invalid_select: 'Invalid selection. Please pick an item from the list.',
        you_selected: 'You selected *{name}*.\nPlease enter Devotee Name:',
        nak_text: '⭐ *Select Nakshathram (Star)* ⭐',
        nak_title: 'Nakshathram',
        nak_button: 'View Nakshathram',
        nak_section: 'Nakshathram ({from}-{to})',
        invalid_nak: 'Invalid nakshathram. Please pick one from the list.',
        date_text: '📅 *Select Performing Date* 📅\n\nEach date shows its nakshathram.',
        date_title: 'Performing Date',
        date_button: 'View Dates',
        date_section: 'Dates ({from}-{to})',
        date_no_info: 'Info unavailable',
        date_nak_less: 'No new star',
        invalid_date: 'Invalid date. Please pick a date from the list.',
        add_more_text: 'Vazhipadu added! Do you want to book another item?',
        add_more_yes: '➕ Add another',
        add_more_no: '✅ Proceed',
        add_more_invalid: "Please tap 'Add another' or 'Proceed'.",
        confirm_invalid: "Please tap 'Confirm' or 'Cancel'.",
        summary_title: '📝 *Booking Summary*',
        summary_item: '{n}. *{name}*\n   Devotee: {devotee}\n   Nakshathram: {nak}\n   Date: {date}\n   Amount: ₹{price}',
        summary_total: '*Total Amount: ₹{total}*',
        summary_footer: 'Confirm to proceed to payment',
        confirm: '✅ Confirm',
        cancel: '❌ Cancel',
        cancelled: 'Booking cancelled. Reply \'0\' for Main Menu.',
        pay_prompt: 'Total Amount: ₹{total}\n\nSelect Payment Mode:',
        pay_upi: '💳 Pay by UPI',
        pay_counter: '🏛️ Pay at Temple Counter',
        pay_invalid: "Please tap 'Pay by UPI' or 'Pay at Counter'.",
        generating_qr: 'Generating UPI QR Code... Please wait.',
        receipt_paid: '✅ *Payment Successful & Booking Confirmed!* ✅\n\n*Order ID:* {order_id}\n',
        receipt_counter: '✅ *Booking Saved (Pay at Counter)* ✅\n\n*Order ID:* {order_id}\nPlease show this message at the temple counter to pay ₹{total}.\n',
        receipt_line: '- {name} for {devotee} on {date}',
        receipt_thanks: '\nThank you for your offering. May God bless you! 🙏'
    },

    payment: {
        qr_caption: 'Please scan this QR code to pay ₹{amount}.\n\n*Amount must be exact for auto-confirmation!*\n(Tip: If you are on your phone, you can screenshot this QR and upload it in your UPI app\'s scanner)',
        session_expired: 'Payment session expired. Please try booking again.',
        too_many: 'Too many concurrent payments. Please try again in a minute.',
        admin_error: 'System Error: Admin not configured.',
        generate_error: 'Error generating payment. Please try again later.'
    },

    admin_panchangam: {
        header: '📅 *Tomorrow\'s Panchangam* 📅',
        date_label: '📆 Date: {gregorian} ({weekday})',
        malayalam_label: '🪔 Malayalam: {month} {day}, {year}',
        nakshathram_label: '⭐ Nakshathram: {nak}',
        nakshathram_less_label: '⚠️ *Nakshathram-less Day*',
        nakshathram_less_desc: '   Tomorrow and the day after share the same nakshathram, so no new star rises tomorrow.',
        nakshathram_span_label: '   Spanning: {prev} → {next}',
        tithi_label: '🌙 Tithi: {tithi} ({paksha})',
        yoga_label: '🧘 Yoga: {yoga}',
        karana_label: '🔁 Karana: {karana}',
        sunrise_label: '🌅 Sunrise: {time}',
        sunset_label: '🌇 Sunset: {time}',
        rahukalam_label: '⚠️ Rahukalam: {time}',
        yamagandam_label: '⚠️ Yamagandam: {time}',
        gulika_label: '⚠️ Gulika: {time}',
        vishesham_label: '🎉 Special: {events}',
        footer: '\n🙏 May God bless all! 🙏'
    },

    reminders: {
        // Sent the evening before (tomorrow's poojas/vazhipadus).
        vazhipadu_tomorrow: '🌺 *Vazhipadu Reminder* 🌺\n\nDear {name}, your *{vazhipadu}* offering (for {devotee}, {nak}) is scheduled to be performed *tomorrow* ({date}) at Kaippulli Temple.\n\nMay God bless you! 🙏',
        nakshathra_tomorrow: '🕉️ *Nakshathra Pooja Reminder* 🕉️\n\nDear {name}, your nakshathra pooja for *{nak}* is scheduled to be performed *tomorrow* ({date}) at Kaippulli Temple.\n\nMay God bless you! 🙏',
        // Sent the same morning (today's poojas/vazhipadus, as a completed confirmation).
        vazhipadu_today: '🌺 *Vazhipadu Performed* 🌺\n\nDear {name}, your *{vazhipadu}* offering (for {devotee}, {nak}) is being performed *today* ({date}) at Kaippulli Temple.\n\nMay God bless you! 🙏',
        nakshathra_today: '🕉️ *Nakshathra Pooja Performed* 🕉️\n\nDear {name}, your nakshathra pooja for *{nak}* is being performed *today* ({date}) at Kaippulli Temple.\n\nMay God bless you! 🙏'
    },

    donation: {
        purpose_text: '🙏 *Temple Donation*\n\nWhat would you like to donate towards?',
        purpose_annadanam: '🍲 Annadanam',
        purpose_renovation: '🏛️ Temple Renovation',
        purpose_events: '🎉 Upcoming Events',
        pick_purpose: 'Please tap one of the donation options.',
        selected_purpose: 'You selected *{name}*.\nEnter the amount you wish to donate (in ₹):',
        invalid_amount: 'Please enter a valid amount.',
        pay_prompt: 'Donation Purpose: {purpose}\nDonation Amount: ₹{amount}\n\nSelect Payment Mode:',
        pay_upi: '💳 Pay by UPI',
        pay_counter: '🏛️ Pay at Temple Counter',
        pay_invalid: "Please tap 'Pay by UPI' or 'Pay at Counter'.",
        generating_qr: 'Generating UPI QR Code... Please wait.',
        receipt_paid: '✅ *Donation Successful!* ✅\n\n*Order ID:* {order_id}\n*Purpose:* {purpose}\n*Amount:* ₹{amount}\n\nThank you for your generous contribution. May God bless you! 🙏',
        receipt_counter: '✅ *Donation Saved (Pay at Counter)* ✅\n\n*Order ID:* {order_id}\n*Purpose:* {purpose}\nPlease show this message at the temple counter to donate ₹{amount}.\nThank you! 🙏'
    }
};
