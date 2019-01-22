let config = require('../config');

let db = require('../db/sqlite3');
var coinmate = require('../coinmate');

// Async Init
(async function () {
    // Promise not compatible with config.debug && console.log, async is?
    await db.connect();
    await start();
})();

/**
 *
 * 1) Check number of open orders on coinmate vs local database
 *  a) if equal lets continue
 *  b) stop if not
 * 2) Next step based on how much open orders we have
 *  a) 0 = open new
 *  b) >0 = check if can open new
 */

// setTimeout with support await
const timeout = ms => new Promise(res => setTimeout(res, ms));

let myAccount = {balanceEUR: 0.0000,availableEUR: 0.0000,balanceIOT: 0.0000,availableIOT: 0.0000,"buyId": "", buyPrice:0.0000, "sellId":"", sellPrice:0.0000};

async function start() {

    //await timeout(5000);
    /*
    let countLocalOpenOrders = await db.countOpenOrders();
    let countCoinmateOpenOrders = await coinmate.getOpenOrders("BTC_CZK");
    let isSynced = await checkSyncDbs(countLocalOpenOrders, countCoinmateOpenOrders);
    if (isSynced && countLocalOpenOrders === 0){
        config.debug && console.log("Open new order!");
        let book = await coinmate.getOrderBook("BTC_CZK");
        config.debug && console.log(book.data.asks[0]);
        config.debug && console.log(book.data.bids[0]);
    } else {
        config.debug && console.log("Check progress!");
    }
    */

    let balance = await coinmate.getBalance();
    config.debug && console.log(balance);
    /*
    let openOrders = await coinmate.getOpenOrders("BTC_CZK");

    let transactionHistory = await coinmate.getTransactionHistory(148114073);
    config.debug && console.log(transactionHistory);
    let orderHistory = await coinmate.getOrderHistory("BTC_CZK", 1);
    config.debug && console.log(orderHistory);
    */

}

async function checkSyncDbs(countLocalOpenOrders, countCoinmateOpenOrders){
    if(!countCoinmateOpenOrders.error){
        if(countLocalOpenOrders === countCoinmateOpenOrders.data.length){
            return true;
        } else {
            config.debug && console.log("Count open orders does not match (local db vs coinmate db)!");
            return false;
        }
    } else {
        config.debug && console.log("countCoinmateOpenOrders error! " + countCoinmateOpenOrders);
        return false;
    }
}

// Start the application after the database connection is ready
//go();

async function go() {
    try {
        var ordersCount = await getAllOrders();
        if(ordersCount === 0){
            //await getOrderBook();
            let orderSymbol = "BTC_CZK";
            let orderSize = 0.0002;
            let orderPrice = 100000;
            let orderId = await buyLimitOrder(orderSymbol, orderSize, orderPrice);
            let newOrder = coinmate.getNewOrderForm;
            newOrder.order_id = orderId;
            newOrder.timestamp = Date.now();
            newOrder.type = "buy";
            newOrder.symbol = orderSymbol;
            newOrder.size = orderSize;
            newOrder.price = orderPrice;
            //await getOrderHistory();
            await getTransactionHistory(orderId);
            await insertOrder(newOrder);
            //await getOpenOrders();
        } else {
            //await insertOrder();
        }

    } catch (e) {
        console.error(e); // 💩
    }
}



function insertOrder(order){
    return new Promise(function (resolve) {
        db.insertOrder(function (response) {
            config.debug && console.log(response);
            resolve();
        }, order);
    });
}
function getAllOrders(){
    return new Promise(function (resolve) {
        db.getAllOrders(function(response) {
            //config.debug && console.log(response);
            resolve(response.length);
        });
    });
}
function getOpenOrders(){
    return new Promise(function (resolve) {
        coinmate.getOpenOrders(function(status, body) {
            if(status === 200 && !body.error ) {
                config.debug && console.log(body.data.length);
                config.debug && console.log(body);
                resolve(body.data[0].id);
            }
        }, "BTC_CZK");
    });
}

function buyLimitOrder(currencyPair, amount, price){
    return new Promise(function (resolve) {
        coinmate.buyLimitOrder(function(status, body) {
            if(status === 200 && !body.error ) {
                config.debug && console.log(body);
                resolve(body.data);
            }
        }, currencyPair, amount, price);
    });
}

function getTransactionHistory(orderId){
    return new Promise(function (resolve) {
        coinmate.getTransactionHistory(function(status, body) {
            if(status === 200 && !body.error ) {
                config.debug && console.log(body);
                resolve();
            }
        }, orderId);
    });
}
function getOrderHistory(){
    return new Promise(function (resolve) {
        coinmate.getOrderHistory(function(status, body) {
            if(status === 200 && !body.error ) {
                config.debug && console.log(body.data.length)
                config.debug && console.log(body);
                resolve();
            }
        }, "BTC_CZK", 1);
    });
}