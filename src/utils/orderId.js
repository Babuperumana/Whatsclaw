const TABLE_MAP = {
    V:  'vazhipadu_bookings',
    D:  'donations_payment_details',
    CV: 'vazhipadu_bookings',
    CD: 'donations_payment_details'
};

const COUNTER_TYPES = ['V', 'D', 'CV', 'CD'];

/**
 * Seed the order_counters table from existing data.
 * Call this once at startup so the counter reflects the highest existing
 * order_id, even after a DB restore or volume recreation.
 */
async function seedCounters(getXbyY, setXbyY) {
    for (const type of COUNTER_TYPES) {
        const rows = await getXbyY(
            `SELECT order_id FROM ${TABLE_MAP[type]} WHERE order_id GLOB ? ORDER BY order_id DESC LIMIT 1`,
            [`${type}*`]
        );
        if (rows.length > 0) {
            const match = rows[0].order_id.match(new RegExp(`^${type}(\\d+)$`));
            if (match) {
                const maxNum = parseInt(match[1], 10);
                await setXbyY(
                    `INSERT INTO order_counters (type, next_num) VALUES (?, ?)`,
                    [type, maxNum + 1]
                );
            }
        }
    }
}

/**
 * Generate the next sequential order ID for a given type + payment mode.
 *
 * Uses a dedicated counters table with atomic increment so the sequence
 * survives restarts and never duplicates, even with concurrent requests.
 *
 * Prefixes:
 *   V  – Vazhipadu (UPI)
 *   CV – Vazhipadu (Counter)
 *   D  – Donation (UPI)
 *   CD – Donation (Counter)
 *
 * @param {'V'|'D'|'CV'|'CD'} type
 * @param {Function} getXbyY
 * @param {Function} setXbyY
 * @returns {Promise<string>} e.g. 'V000001', 'CV000001', 'D000001', 'CD000001'
 */
async function generateOrderId(type, getXbyY, setXbyY) {
    if (!TABLE_MAP[type]) throw new Error(`Unknown order type: ${type}`);

    // Ensure the counter table exists (self-healing for existing DBs).
    await setXbyY(
        `CREATE TABLE IF NOT EXISTS order_counters (
            type TEXT PRIMARY KEY,
            next_num INTEGER NOT NULL DEFAULT 1
        )`
    );

    // Ensure the counter row exists for this type.
    await setXbyY(
        `INSERT OR IGNORE INTO order_counters (type, next_num) VALUES (?, 1)`,
        [type]
    );

    // Atomically increment and fetch the new value in one statement.
    const rows = await getXbyY(
        `UPDATE order_counters SET next_num = next_num + 1 WHERE type = ? RETURNING next_num`,
        [type]
    );
    const nextNum = rows[0]?.next_num ?? 1;
    return `${type}${String(nextNum).padStart(6, '0')}`;
}

module.exports = { generateOrderId, seedCounters };
