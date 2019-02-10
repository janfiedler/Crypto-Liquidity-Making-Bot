const sqlite3 = require('sqlite3').verbose();
let db = {};
let dbApi = {};

dbApi.connect = function(){
    return new Promise(function (resolve) {
        db = new sqlite3.Database('db/clmb.sqlite3', function(err) {
            if (err) {
                console.error(err.message);
                resolve(false);
            } else {
                //Need set timeout waiting when SQLite file is locked by one of the child processes.
                db.configure("busyTimeout", 60000);
                console.log("Connected to database!");
                resolve(true);
            }
        });
    });
};

dbApi.createTables = function(){
    return new Promise(async function (resolve) {
        await createTableOrders();
        resolve(true);
    });
};

function createTableOrders(){
    return new Promise(function (resolve) {
        // seed = private iota seed, keyIndex = actual keyIndex of seed, balance = actual seed balance, bundle = bundle from transaction, value = value in transaction
        db.run(`CREATE TABLE IF NOT EXISTS orders (exchange TEXT, pair TEXT, status TEXT, buy_status TEXT, buy_id TEXT, buy_price INTEGER, buy_size REAL, buy_created TEXT, buy_filled REAL, buy_fee REAL, sell_status TEXT, sell_id TEXT, sell_price REAL, sell_target_price REAL, sell_size REAL, sell_created TEXT, sell_filled REAL, sell_fee REAL, profit REAL, completed_at TEXT);`, function(err) {
            if (err) {
                console.log(err.message);
            } else {
                console.log("Table orders OK!");
                resolve(true);
            }
        });
    });
}

dbApi.getOpenedBuyOrder = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND buy_status = ? AND buy_id IS NOT NULL`, exchange, pair, "open", (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(row);
            }
        });
    });
};



dbApi.getOpenedSellOrder = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND sell_status = ? AND sell_id IS NOT NULL`, exchange, pair, "open", (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(row);
            }
        });
    });
};

dbApi.saveOpenedBuyOrder = function(exchange, pair, createdOrder){
    return new Promise(function (resolve) {
        db.run(`insert INTO orders(exchange, pair, status, buy_status, buy_id, buy_price, buy_size, buy_created) VALUES (?,?,?,?,?,?,?,?)`, exchange, pair.name, "buy", "open", createdOrder.data.id, createdOrder.data.price, createdOrder.data.size, createdOrder.data.created_at, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

dbApi.deleteOpenedBuyOrder = function(id){
    return new Promise(function (resolve) {
        db.run(`DELETE FROM orders WHERE buy_id=?`, id, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

dbApi.getLowestFilledBuyOrder = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND status = ? ORDER BY buy_price ASC LIMIT ?`,exchange, pair, "sell", 1, (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(row);
            }
        });
    });
};

dbApi.deleteOpenedSellOrder = function(id){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET sell_status = ?, sell_id = ?, sell_created = ? WHERE sell_id = ?;`, "pending", "", "", id, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

dbApi.setPendingSellOrder = function(data, sell_target_price){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET status = ?, buy_status = ?, buy_filled = ?, buy_fee = ?, sell_status = ?, sell_target_price = ?, sell_size = ? WHERE buy_id= ?;`, "sell", data.status, data.size_filled, data.fee, "pending", sell_target_price, data.size_filled, data.id, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

dbApi.setCompletedSellOrder = function(orderDetail){

    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET status = ?, sell_status = ?, sell_filled = ?, sell_fee = ?, completed_at = ? WHERE sell_id = ?;`, "completed", orderDetail.status, orderDetail.size_filled, orderDetail.fee, new Date().toISOString(), orderDetail.id, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

dbApi.reOpenPartFilledSellOrder = function(exchange, pair, resultOpenedOrder, newSellSize){
    return new Promise(function (resolve) {
        db.run(`insert INTO orders(exchange, pair, status, buy_status, buy_id, buy_price, buy_size, buy_filled, buy_created, sell_status, sell_price, sell_target_price, sell_size) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,exchange, pair.name, "sell", resultOpenedOrder.buy_status, resultOpenedOrder.buy_id, resultOpenedOrder.buy_price, resultOpenedOrder.buy_size, resultOpenedOrder.buy_filled, resultOpenedOrder.buy_created, "pending", resultOpenedOrder.sell_price, resultOpenedOrder.sell_target_price, newSellSize, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

dbApi.setOpenedSellerOrder = function(pair, pendingSellOrder, createdOrder){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET sell_status = ?, sell_id = ?, sell_price = ?, sell_created = ? WHERE status = ? AND buy_id = ?;`, "open", createdOrder.data.id, parseFloat(createdOrder.data.price), createdOrder.data.created_at, "sell", pendingSellOrder.buy_id, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

dbApi.countOpenOrders = function(){
    return new Promise(function (resolve) {
        db.get(`SELECT COUNT(*) AS openCount FROM orders WHERE status = ?`, "ACTIVE", (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(row.openCount);
            }
        });
    });
};

dbApi.close = function() {
    return new Promise(function (resolve) {
        db.close((err) => {
            if (err) {
                console.error(err.message);
            } else {
                console.log('Database connection closed.');
                resolve(true);
            }
        });
    });
};

module.exports = dbApi;