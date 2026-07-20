const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, 'database.sqlite'));

db.serialize(() => {
    db.run("INSERT INTO vazhipadu_master (name, price) VALUES ('Test Item 1', 1.00)");
    db.run("INSERT INTO vazhipadu_master (name, price) VALUES ('Test Item 2', 2.00)", (err) => {
        if(err) console.error(err);
        else console.log("Test items added successfully!");
    });
});
db.close();
