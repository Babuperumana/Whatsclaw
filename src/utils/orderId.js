const TABLE_MAP = {
    V:  'vazhipadu_bookings',
    D:  'donations_payment_details',
    CV: 'vazhipadu_bookings',
    CD: 'donations_payment_details'
};

/**
 * Generate the next sequential order ID for a given type + payment mode.
 *
 * Prefixes:
 *   V  – Vazhipadu (UPI)
 *   CV – Vazhipadu (Counter)
 *   D  – Donation (UPI)
 *   CD – Donation (Counter)
 *
 * @param {'V'|'D'|'CV'|'CD'} type
 * @param {Function} getXbyY
 * @returns {Promise<string>} e.g. 'V000001', 'CV000001', 'D000001', 'CD000001'
 */
async function generateOrderId(type, getXbyY) {
    if (!TABLE_MAP[type]) throw new Error(`Unknown order type: ${type}`);

    const rows = await getXbyY(
        `SELECT order_id FROM ${TABLE_MAP[type]} WHERE order_id GLOB ? ORDER BY order_id DESC LIMIT 5`,
        [`${type}*`]
    );

    let maxNum = 0;
    for (const r of rows) {
        const match = r.order_id.match(new RegExp(`^${type}(\\d+)$`));
        if (match) {
            const n = parseInt(match[1], 10);
            if (n > maxNum) maxNum = n;
        }
    }

    // Also check the payment orders table for UPI-created orders
    const paymentRows = await getXbyY(
        `SELECT order_id FROM orders WHERE order_id GLOB ? ORDER BY order_id DESC LIMIT 5`,
        [`${type}*`]
    );
    for (const r of paymentRows) {
        const match = r.order_id.match(new RegExp(`^${type}(\\d+)$`));
        if (match) {
            const n = parseInt(match[1], 10);
            if (n > maxNum) maxNum = n;
        }
    }

    const next = maxNum + 1;
    return `${type}${String(next).padStart(6, '0')}`;
}

module.exports = { generateOrderId };
