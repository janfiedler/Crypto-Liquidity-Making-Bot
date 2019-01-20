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

dbApi.getOpenedBuyOrder = function(pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE pair = ? AND buy_status = ? AND buy_id IS NOT NULL`, pair, "open", (err, row) => {
            if (err) {
                console.error(err.message);
            }
            resolve(row);
        });
    });
};

dbApi.saveOpenedBuyOrder = function(pair, myAccount){
    return new Promise(function (resolve) {
        db.run(`insert INTO orders(pair, status, buy_status, buy_id, buy_price, buy_size, buy_funds, buy_created) VALUES (?,?,?,?,?,?,?,?)`, pair.name, "buy", "open", myAccount.coinfalcon.buyData[pair.name].id, myAccount.coinfalcon.buyData[pair.name].price, myAccount.coinfalcon.buyData[pair.name].size, myAccount.coinfalcon.buyData[pair.name].funds, myAccount.coinfalcon.buyData[pair.name].created_at, function(err) {
            if (err) {
                return console.log(err.message);
            }
            resolve(true);
        });
    });
};

dbApi.deleteOpenedBuyOrder = function(id){
    return new Promise(function (resolve) {
        db.run(`DELETE FROM orders WHERE buy_id=?`, id, function(err) {
            if (err) {
                return console.log(err.message);
            }
            resolve(true);
        });
    });
};

dbApi.getLowestFilledBuyOrder = function(pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE pair = ? AND status = ? ORDER BY buy_price ASC LIMIT ?`, pair, "sell", 1, (err, row) => {
            if (err) {
                console.error(err.message);
            }
            resolve(row);
        });
    });
};


dbApi.setPendingSellOrder = function(id, buy_status, buy_size_filled,  sell_price){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET status = ?, buy_status = ?, sell_status = ?, sell_price = ? WHERE buy_id= ?;`, "sell", buy_status, "pending", sell_price, id, function(err) {
            if (err) {
                return console.log(err.message);
            }
            resolve(true);
        });
    });
};

dbApi.setOpenedSellerOrder = function(pair, myAccount){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET sell_status = ?, sell_id = ? WHERE buy_id = ?;`, "open", myAccount.coinfalcon.sellData[pair.name].id, myAccount.coinfalcon.buyData[pair.name].id, function(err) {
            if (err) {
                return console.log(err.message);
            }
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