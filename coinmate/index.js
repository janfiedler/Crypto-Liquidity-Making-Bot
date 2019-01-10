let env = process.env.NODE_ENV || 'development';
let config = require('../config')[env];

const crypto = require('crypto');
var request = require('request');

sign = function() {
    let clientId = config.clientId;
    let publicApiKey = config.publicKey;
    let nonce = Date.now().toString();
    let signatureInput =  nonce + clientId + publicApiKey;

    const hmac = crypto.createHmac('sha256', config.privateKey);
    hmac.update(signatureInput);
    let signature = hmac.digest('hex').toUpperCase();
    return "clientId="+clientId+"&publicKey="+publicApiKey+"&nonce="+nonce+"&signature="+signature;
};

exports.getNewOrderForm = {order_id: 0, timestamp: 0, type: "", symbol: "", size: 0, price: 0, profit: null};

exports.getBalance = function(){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/balances',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: sign()
        }, function (error, response, body) {
            if (error) throw error;
            if(response.statusCode === 200) {
                resolve(JSON.parse(body));
            }
        });
    });
};

/* Get my actual open orders waiting on FILLED*/
exports.getOpenOrders = function (currencyPair){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/openOrders',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "currencyPair=" + currencyPair + "&" + sign()
        }, function (error, response, body) {
            if (error) throw error;
            if(response.statusCode === 200) {
                resolve(JSON.parse(body));
            }
        });
    });
};

exports.getTransactionHistory = function (orderId ){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/transactionHistory',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "orderId=" + orderId + "&" + sign()
        }, function (error, response, body) {
            if (error) throw error;
            if(response.statusCode === 200) {
                resolve(JSON.parse(body));
            }
        });
    });
};

exports.getOrderHistory = function (currencyPair, limit){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/orderHistory',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "currencyPair=" + currencyPair + "&limit=" + limit + "&" + sign()
        }, function (error, response, body) {
            if (error) throw error;
            if(response.statusCode === 200) {
                resolve(JSON.parse(body));
            }
        });
    });
};

/* Get actual order book with buys and sells */
exports.getOrderBook = function (pair){
    return new Promise(function (resolve) {
        request('https://coinmate.io/api/orderBook?currencyPair='+pair+'&groupByPriceLimit=false', function (error, response, body) {
            if (error) throw error;
            if(response.statusCode === 200) {
                resolve(JSON.parse(body));
            }
        });
    });
};



exports.buyLimitOrder = function (callback, currencyPair, amount, price){
    request({
        method: 'POST',
        url: 'https://coinmate.io/api/buyLimit',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: "currencyPair=" + currencyPair + "&amount=" + amount + "&price=" +price + "&" + sign()
    }, function (error, response, body) {
        if (error) throw error;
        callback(response.statusCode, JSON.parse(body));
    });
};

