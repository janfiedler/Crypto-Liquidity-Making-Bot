const sqlite3 = require('sqlite3').verbose();
let db = {};
let dbApi = {};

dbApi.connect = function(){
    return new Promise(function (resolve) {
        db = new sqlite3.Database('db/clmb.sqlite3', function(err) {
            if (err) {
                console.error(err.message);
                resolve(false);
            }
            console.log("Connected to database!");
            resolve(true);
        });
    });
};

dbApi.countOpenOrders = function(){
    return new Promise(function (resolve) {
        db.get(`SELECT COUNT(*) AS openCount FROM orders WHERE status = ?`, "ACTIVE", (err, row) => {
            if (err) {
                return console.error(err.message);
            }
            resolve(row.openCount);
        });
    });
};

dbApi.select = function(){
    db.serialize(() => {
        db.each(`SELECT * FROM pool`, (err, row) => {
            if (err) {
                console.error(err.message);
            }
            console.log(row.address + "\t" + row.shares + "\t" + row.withdrawn  + "\t" + row.balance + "\t" + row.total);
        });
    });
};

dbApi.insertShares = function(address, amount){
    // insert one row into the langs table
    db.run(`insert or ignore INTO pool(address, shares) VALUES (?, ?);`, address, amount, function(err) {
        if (err) {
            return console.log(err.message);
        }
    });
    db.run(`UPDATE pool SET shares = shares + ? WHERE address= ?;`, amount, address, function(err) {
        if (err) {
            return console.log(err.message);
        }
    });
};

dbApi.close = function() {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed.');
        // Now we can kill process
        process.exit();
    });
};

process.on('SIGINT', () => {
    dbApi.close();
});

module.exports = dbApi;