const tools = require('../src/tools');
const sqlite3 = require('sqlite3').verbose();
let db = {};
let dbApi = {};

let connect = function(){
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

let createTables = function(){
    return new Promise(async function (resolve) {
        await createTableOrders();
        await createTableCondition();
        await createTableFunding();
        await createTableFundingHistory();
        await createTableFundingTransferHistory();
        resolve(true);
    });
};

function createTableOrders(){
    return new Promise(function (resolve) {
        db.run(`CREATE TABLE IF NOT EXISTS orders (exchange TEXT, pair TEXT, pair_id INTEGER, status TEXT, buy_status TEXT, buy_id TEXT, buy_price REAL, buy_size REAL, buy_created TEXT, buy_filled REAL, buy_fee REAL, sell_status TEXT, sell_id TEXT, sell_price REAL, sell_target_price REAL, sell_size REAL, sell_created TEXT, sell_filled REAL, sell_fee REAL, profit REAL, completed_at TEXT);`, function(err) {
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

function createTableFunding(){
    return new Promise(function (resolve) {
        db.run(`CREATE TABLE IF NOT EXISTS funding (exchange TEXT, pair TEXT, pair_id INTEGER, asset TEXT, amount REAL, updated TEXT);`, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                console.log("Table funding OK!");
                resolve(true);
            }
        });
    });
}

function createTableFundingHistory(){
    return new Promise(function (resolve) {
        db.run(`CREATE TABLE IF NOT EXISTS funding_history (exchange TEXT, pair TEXT, pair_id INTEGER, asset TEXT, amount REAL, type TEXT, tranId INTEGER, created TEXT);`, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                console.log("Table funding_history OK!");
                resolve(true);
            }
        });
    });
}

function createTableFundingTransferHistory(){
    return new Promise(function (resolve) {
        db.run(`CREATE TABLE IF NOT EXISTS funding_transfer_history (exchange TEXT, pair TEXT, pair_id INTEGER, asset TEXT, amount REAL, type TEXT, tranId INTEGER, created TEXT);`, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                console.log("Table funding_transfer_history OK!");
                resolve(true);
            }
        });
    });
}

let getFunding = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT amount FROM funding WHERE exchange = ? AND pair = ? AND pair_id = ? AND asset = ?`, exchange, pair.name, pair.id, pair.name.split(pair.separator)[1], (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                if(typeof row !== 'undefined' && row) {
                    row.amount = tools.setPrecision(row.amount, pair.digitsPrice);
                    resolve(row);
                } else {
                    resolve({amount: 0})
                }
            }
        });
    });
};

let updateFunding = function(exchange, pair, amount, type){
    return new Promise(function (resolve) {
        let countCondition = "";
        if(type === "borrow"){
            countCondition = "+";
        } else if (type === "repay"){
            countCondition = "-";
        }
        db.run(`UPDATE funding SET amount = amount `+countCondition+` ?, updated = ? WHERE exchange = ? AND pair = ? AND pair_id = ? AND asset = ?;`, amount, new Date().toISOString(), exchange, pair.name, pair.id, pair.name.split(pair.separator)[1],
            function(err) {
                if (err) {
                    console.log(err.message);
                } else {
                    if(this.changes > 0){
                        resolve(true);
                    } else {
                        db.run(`insert INTO funding(exchange, pair, pair_id, asset, amount, updated) VALUES (?, ?, ?, ?, ?, ?);`, exchange, pair.name, pair.id, pair.name.split(pair.separator)[1], amount, new Date().toISOString(),
                            function(err) {
                                if (err) {
                                    return console.log(err.message);
                                } else {
                                    resolve(true);
                                }
                            });
                    }
                }
        });
    });
};

let saveFundingHistory = function(exchange, pair, amount, type, tranId){
    return new Promise(function (resolve) {
        db.run(`insert INTO funding_history(exchange, pair, pair_id, asset, amount, type, tranId, created) VALUES (?,?,?,?,?,?,?,?)`, exchange, pair.name, pair.id, pair.name.split(pair.separator)[1], amount, type, tranId, new Date().toISOString(), function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

let saveFundTransferHistory = function(exchange, pair, amount, type, tranId){
    return new Promise(function (resolve) {
        db.run(`insert INTO funding_transfer_history(exchange, pair, pair_id, asset, amount, type, tranId, created) VALUES (?,?,?,?,?,?,?,?)`, exchange, pair.name, pair.id, pair.name.split(pair.separator)[1], amount, type, tranId, new Date().toISOString(), function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

let getCondition = function(condition){
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

let updateCondition = function(key, value){
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

let getOpenedBuyOrder = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND buy_status = ? AND buy_id IS NOT NULL`, exchange, pair.name, pair.id, "open", (err, row) => {
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

let getOpenedSellOrder = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND sell_status = ? AND sell_id IS NOT NULL`, exchange, pair.name, pair.id, "open", (err, row) => {
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

let saveOpenedBuyOrder = function(exchange, pair, createdOrder){
    return new Promise(function (resolve) {
        db.run(`insert INTO orders(exchange, pair, pair_id, status, buy_status, buy_id, buy_price, buy_size, buy_created) VALUES (?,?,?,?,?,?,?,?,?)`, exchange, pair.name, pair.id, "buy", "open", createdOrder.data.id, createdOrder.data.price, createdOrder.data.size, createdOrder.data.created_at, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

let deleteOpenedBuyOrder = function(id){
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

let getFilledBuyOrder = function(exchange, pair, order){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND frozen = 0 ORDER BY buy_price `+order+` LIMIT ?`,exchange, pair.name, pair.id, "sell", 1, (err, row) => {
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

let getLowestSellTargetPrice = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND frozen = 0 ORDER BY sell_target_price ASC LIMIT ?`,exchange, pair.name, pair.id, "sell", 1, (err, row) => {
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

let getOldestPendingSellOrder = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND frozen = 0 ORDER BY buy_price DESC LIMIT ?`,exchange, pair.name, pair.id, "sell", 1, (err, row) => {
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

let setOldestOrderWithLossForSell = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND frozen = ? ORDER BY buy_price DESC LIMIT ?`,exchange, pair.name, pair.id, "sell", 0, 1, (err, row) => {
            if (err) {
                console.error(err.message);
                resolve({"error": err.message});
            } else {
                if(typeof row !== 'undefined' && row) {
                    db.run(`UPDATE orders SET sell_target_price = ? WHERE buy_id = ? AND exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND sell_status = ?;`, 0, row.buy_id, exchange, pair.name, pair.id, "sell", "pending", function(err) {
                        if (err) {
                            console.error(err.message);
                            resolve({"error": err.message});
                        } else {
                            resolve(row);
                        }
                    });
                } else {
                    console.error("setOldestOrderWithLossForSell typeof row === 'undefined'");
                    resolve({"error": "setOldestOrderWithLossForSell typeof row === 'undefined'"});
                }
            }
        });
    });
};

let setSellTargetPrice = function(exchange, pair, buy_id, price){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET sell_target_price = ? WHERE buy_id = ? AND exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND sell_status = ?;`, price, buy_id, exchange, pair.name, pair.id, "sell", "pending", function(err) {
            if (err) {
                console.error(err.message);
                resolve(false);
            } else {
                resolve(true);
            }
        })
    });
};

let deleteOpenedSellOrder = function(id){
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

let setPendingSellOrder = function(data, sell_target_price){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET status = ?, buy_price = ?, buy_status = ?, buy_filled = ?, buy_fee = ?, sell_status = ?, sell_target_price = ?, sell_size = ? WHERE buy_id= ?;`, "sell", data.price, data.status, data.size_filled, data.fee, "pending", sell_target_price, data.size_filled, data.id, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

let setFailedSellOrder = function(failedOrder){
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

let setCompletedSellOrder = function(orderDetail){
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

let reOpenPartFilledSellOrder = function(exchange, pair, resultOpenedOrder, newSellSize){
    return new Promise(function (resolve) {
        db.run(`insert INTO orders(exchange, pair, pair_id, status, buy_status, buy_id, buy_price, buy_size, buy_created, buy_filled, buy_fee, sell_status, sell_price, sell_target_price, sell_size) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, exchange, pair.name, pair.id, "sell", resultOpenedOrder.buy_status, resultOpenedOrder.buy_id, resultOpenedOrder.buy_price, resultOpenedOrder.buy_size, resultOpenedOrder.buy_created, resultOpenedOrder.buy_filled, resultOpenedOrder.buy_fee, "pending", resultOpenedOrder.sell_price, resultOpenedOrder.sell_target_price, newSellSize, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

let setOpenedSellerOrder = function(pair, pendingSellOrder, createdOrder){
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

let getProfit = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT SUM(profit) as total FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND sell_status != ? AND sell_status != ?`, exchange, pair.name, pair.id, "completed", "collection", "withdraw", (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(row.total);
            }
        });
    });
};

let getPositiveProfit = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT SUM(profit) as total FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND sell_status != ? AND sell_status != ? AND profit >= 0`, exchange, pair.name, pair.id, "completed", "collection", "withdraw", (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(row.total);
            }
        });
    });
};

let getNegativeProfit = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT SUM(profit) as total FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND sell_status != ? AND sell_status != ? AND profit < 0`, exchange, pair.name, pair.id, "completed", "collection", "withdraw", (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                if(row.total ===  null){
                    resolve(0);
                } else {
                    resolve(row.total);
                }
            }
        });
    });
};

let getDailyProfit = function(exchange, pair, pairId, date){
    return new Promise(function (resolve) {
        db.get(`SELECT SUM(profit) as total FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND sell_status != ? AND sell_status != ? AND completed_at like ?`, exchange, pair, pairId, "completed", "collection", "withdraw", date, (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(row);
            }
        });
    });
};

let getTotalSellSize = function(exchange, pair){
    return new Promise(function (resolve) {
        db.get(`SELECT SUM(sell_size) as total FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ?`, exchange, pair.name, pair.id, "sell", (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(tools.setPrecision(row.total, pair.digitsSize));
            }
        });
    });
};

let getAllSellOrders = function(exchange, pair, pairId){
    return new Promise(function (resolve) {
        db.all(`SELECT * FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? ORDER BY exchange, pair, buy_price DESC`, exchange, pair, pairId, "sell", (err, rows) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(rows);
            }
        });
    });
};

let getAllNonFrozenSellOrdersCount  = function(exchange, pair, pairId){
    return new Promise(function (resolve) {
        db.all(`SELECT COUNT(*) as count FROM orders WHERE exchange = ? AND pair = ? AND pair_id = ? AND status = ? AND frozen = ? ORDER BY exchange, pair, buy_price DESC`, exchange, pair, pairId, "sell", 0, (err, rows) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(rows[0]);
            }
        });
    });
};



let getAllCompletedOrders = function(){
    return new Promise(function (resolve) {
        db.all(`SELECT * FROM orders WHERE status = ?`, "completed", (err, rows) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(rows);
            }
        });
    });
};

let getCompletedOrder = function(sell_id){
    return new Promise(function (resolve) {
        db.get(`SELECT * FROM orders WHERE status = ? AND sell_id = ?`, "completed", sell_id, (err, row) => {
            if (err) {
                console.error(err.message);
            } else {
                resolve(row);
            }
        });
    });
};

let updateProfit = function(profit, sell_id){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET profit = ? WHERE sell_id = ?;`, profit, sell_id, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                resolve(true);
            }
        });
    });
};

let setFreeze = function(id, state){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET frozen = ? WHERE buy_id = ? AND status = ?;`, state, id, "sell", function(err) {
            if (err) {
                console.error(err.message);
                resolve(false);
            } else {
                resolve(true);
            }
        })
    });
};

let killOrder = function(id, state){
    return new Promise(function (resolve) {
        db.run(`UPDATE orders SET sell_target_price = 0 WHERE buy_id = ? AND status = ? AND sell_status = ?;`, id, "sell", "pending", function(err) {
            if (err) {
                console.error(err.message);
                resolve(false);
            } else {
                resolve(true);
            }
        })
    });
};

let close = function() {
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

module.exports = {
    connect: connect,
    createTables: createTables,
    getCondition: getCondition,
    updateCondition: updateCondition,
    getOpenedBuyOrder: getOpenedBuyOrder,
    getOpenedSellOrder: getOpenedSellOrder,
    saveOpenedBuyOrder: saveOpenedBuyOrder,
    deleteOpenedBuyOrder: deleteOpenedBuyOrder,
    getFilledBuyOrder: getFilledBuyOrder,
    getLowestSellTargetPrice: getLowestSellTargetPrice,
    getOldestPendingSellOrder: getOldestPendingSellOrder,
    setOldestOrderWithLossForSell: setOldestOrderWithLossForSell,
    setSellTargetPrice: setSellTargetPrice,
    deleteOpenedSellOrder: deleteOpenedSellOrder,
    setPendingSellOrder: setPendingSellOrder,
    setFailedSellOrder: setFailedSellOrder,
    setCompletedSellOrder: setCompletedSellOrder,
    reOpenPartFilledSellOrder: reOpenPartFilledSellOrder,
    setOpenedSellerOrder: setOpenedSellerOrder,
    getProfit: getProfit,
    getPositiveProfit: getPositiveProfit,
    getNegativeProfit: getNegativeProfit,
    getDailyProfit: getDailyProfit,
    getTotalSellSize: getTotalSellSize,
    getAllSellOrders: getAllSellOrders,
    getAllNonFrozenSellOrdersCount: getAllNonFrozenSellOrdersCount,
    getAllCompletedOrders: getAllCompletedOrders,
    getCompletedOrder: getCompletedOrder,
    updateProfit: updateProfit,
    setFreeze: setFreeze,
    killOrder: killOrder,
    getFunding: getFunding,
    updateFunding: updateFunding,
    saveFundingHistory: saveFundingHistory,
    saveFundTransferHistory: saveFundTransferHistory,
    close: close
};