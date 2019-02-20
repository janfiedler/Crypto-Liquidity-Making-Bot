const tools = require('../src/tools');
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
        await createTableCondition();
        resolve(true);
    });
};

function createTableOrders(){
    return new Promise(function (resolve) {
        db.run(`CREATE TABLE IF NOT EXISTS orders (exchange TEXT, pair TEXT, status TEXT, buy_status TEXT, buy_id TEXT, buy_price INTEGER, buy_size REAL, buy_created TEXT, buy_filled REAL, buy_fee REAL, sell_status TEXT, sell_id TEXT, sell_price REAL, sell_target_price REAL, sell_size REAL, sell_created TEXT, sell_filled REAL, sell_fee REAL, profit REAL, completed_at TEXT);`, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                console.log("Table orders OK!");
                resolve(true);
            }
        });
    });
}

function createTableCondition(){
    return new Promise(function (resolve) {
        db.run(`CREATE TABLE IF NOT EXISTS condition (key TEXT, value INTEGER, PRIMARY KEY(key));`, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                db.run(`insert or ignore INTO condition (key, value) VALUES ("safe_shutdown", 1);`, function(err) {
                    if (err) {
                        console.error(err.message);
                    } else {
                        console.log("Table condition OK!");
                        resolve(true);
                    }
                });
            }
        });
    });
}

dbApi.getCondition = function(condition){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM condition WHERE key = ?`, condition, (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(row);
            }
        });
    });
};

dbApi.updateCondition = function(key, value){
    return new Promise(function (resolve) {
        db.run(`UPDATE condition SET value = ? WHERE key = ?; `, value, key, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

dbApi.getOpenedBuyOrder = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND buy_status = ? AND buy_id IS NOT NULL`, exchange, pair.name, "open", (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                if(typeof row !== 'undefined' && row) {
                    row.buy_price = tools.setPrecision(row.buy_price, pair.digitsPrice);
                    row.buy_size = tools.setPrecision(row.buy_size, pair.digitsSize);
                    row.sell_price = tools.setPrecision(row.sell_price, pair.digitsPrice);
                    row.sell_target_price = tools.setPrecision(row.sell_target_price, pair.digitsPrice);
                    row.sell_size = tools.setPrecision(row.sell_size, pair.digitsSize);
                }
                resolve(row);
            }
        });
    });
};

dbApi.getOpenedSellOrder = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND sell_status = ? AND sell_id IS NOT NULL`, exchange, pair.name, "open", (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                if(typeof row !== 'undefined' && row){
                    row.buy_price = tools.setPrecision(row.buy_price, pair.digitsPrice);
                    row.buy_size = tools.setPrecision(row.buy_size, pair.digitsSize);
                    row.sell_price = tools.setPrecision(row.sell_price, pair.digitsPrice);
                    row.sell_target_price = tools.setPrecision(row.sell_target_price, pair.digitsPrice);
                    row.sell_size = tools.setPrecision(row.sell_size, pair.digitsSize);
                }
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
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND status = ? ORDER BY buy_price ASC LIMIT ?`,exchange, pair.name, "sell", 1, (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                if(typeof row !== 'undefined' && row) {
                    row.buy_price = tools.setPrecision(row.buy_price, pair.digitsPrice);
                    row.buy_size = tools.setPrecision(row.buy_size, pair.digitsSize);
                    row.sell_price = tools.setPrecision(row.sell_price, pair.digitsPrice);
                    row.sell_target_price = tools.setPrecision(row.sell_target_price, pair.digitsPrice);
                    row.sell_size = tools.setPrecision(row.sell_size, pair.digitsSize);
                }
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

dbApi.setFailedSellOrder = function(failedOrder){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET status = ?, sell_status = ?, completed_at = ? WHERE buy_id = ? AND sell_id IS NULL;`, "failed", failedOrder.status, new Date().toISOString(), failedOrder.id, function(err) {
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