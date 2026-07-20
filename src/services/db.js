// Promise-based wrappers around the sqlite3 db instance.
// Call createDb(db) once and share the returned helpers everywhere.

function createDb(db) {
    const getXbyY = (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    };

    const setXbyY = (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(query, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    };

    return { getXbyY, setXbyY };
}

module.exports = { createDb };
