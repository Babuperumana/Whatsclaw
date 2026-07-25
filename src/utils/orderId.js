const TABLE_MAP = {
    V: 'vazhipadu_bookings',
    D: 'donations_payment_details'
};

/**
 * Generate the next sequential order ID for a given type.
 * @param {'V'|'D'} type - 'V' for vazhipadu, 'D' for donation
 * @param {Function} getXbyY - db read helper
 * @returns {Promise<string>} e.g. 'V000001', 'D000123'
 */
async function generateOrderId(type, getXbyY) {
    if (!TABLE_MAP[type]) throw new Error(`Unknown order type: ${type}`);

    const table = TABLE_MAP[type];
    const rows = await getXbyY(`SELECT order_id FROM ${table} WHERE order_id GLOB ? ORDER BY order_id DESC LIMIT 5`, [`${type}*`]);

    let maxNum = 0;
    for (const r of rows) {
        const match = r.order_id.match(new RegExp(`^${type}(\\d+)$`));
        if (match) {
            const n = parseInt(match[1], 10);
            if (n > maxNum) maxNum = n;
        }
    }

    // Also check the payment orders table for UPI-created orders
    const paymentRows = await getXbyY(`SELECT order_id FROM orders WHERE order_id GLOB ? ORDER BY order_id DESC LIMIT 5`, [`${type}*`]);
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
