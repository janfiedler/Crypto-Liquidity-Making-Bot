let request = require('request');
const crypto = require('crypto');
const tools = require('../../tools');
let config;

let setConfig = function(data){
    config = data;
};

let sign = function() {
    let clientId = config.clientId;
    let publicApiKey = config.publicKey;
    let nonce = Date.now().toString();
    let signatureInput =  nonce + clientId + publicApiKey;

    const hmac = crypto.createHmac('sha256', config.privateKey);
    hmac.update(signatureInput);
    let signature = hmac.digest('hex').toUpperCase();
    return "clientId="+clientId+"&publicKey="+publicApiKey+"&nonce="+nonce+"&signature="+signature;
};

let getBalance = function(){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/balances',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: sign()
        }, function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    resolve({s:1, data: result.data});
                } else {
                    console.error(body);
                    resolve({s:0, data: result});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, data: {error: "getBalance"}});
            }
        });
    });
};
/* Get actual order book with buys and sells */
let getTicker = function (pair){
    return new Promise(function (resolve) {
        request('https://coinmate.io/api/orderBook?currencyPair='+pair+'&groupByPriceLimit=false', function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    resolve({s:1, data: result});
                } else {
                    console.error(body);
                    resolve({s:0, data: result});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, data: {error: "getTicker"}});
            }
        });
    });
};

let parseTicker = function(type, book, pair, order){
    let ticks = {bid:[],bidBorder: 0, ask:[], askBorder:0};
    let ii=0;
    for(let i=0;i<book.data.asks.length;i++){
        if(i===0){
            ticks.askBorder = parseFloat(book.data.asks[i].price);
        }
        if(type === "ask"){
            if(typeof order !== 'undefined' && order.hasOwnProperty('sell_price') && parseFloat(book.data.asks[i].price) === order.sell_price){
                const askSizeDiff = (parseFloat(book.data.asks[i].amount)-order.sell_size);
                if( askSizeDiff > pair.ignoreOrderSize){
                    ticks.ask.push({price: parseFloat(book.data.asks[i].price), size: tools.setPrecision(askSizeDiff, pair.digitsSize)});
                    ii++;
                }
            } else if( parseFloat(book.data.asks[i].amount) > pair.ignoreOrderSize){
                ticks.ask.push({price: parseFloat(book.data.asks[i].price), size: parseFloat(book.data.asks[i].amount)});
                ii++;
            }
        } else {
            break;
        }
    }
    ii=0;
    for(let i=0;i<book.data.bids.length;i++){
        if(i === 0){
            ticks.bidBorder = parseFloat(book.data.bids[i].price);
        }
        if(type === "bid"){
            if(typeof order !== 'undefined' && order.hasOwnProperty('buy_price') && parseFloat(book.data.bids[i].price) === order.buy_price){
                const bidSizeDiff = (parseFloat(book.data.bids[i].amount)-order.buy_size);
                if( bidSizeDiff > pair.ignoreOrderSize){
                    ticks.bid.push({price: parseFloat(book.data.bids[i].price), size: tools.setPrecision(bidSizeDiff, pair.digitsSize)});
                    ii++;
                } else {
                    //console.log("My position "+book.data.bids[i].price+" was alone (Lets process ask fornot counted ignored), removed from ticks.");
                }
            } else if(parseFloat(book.data.bids[i].amount) > pair.ignoreOrderSize){
                ticks.bid.push({price: parseFloat(book.data.bids[i].price), size: parseFloat(book.data.bids[i].amount)});
                ii++;
            }
        } else {
            break;
        }
    }
    return ticks;
};

let getOrder = async function (id, type, openedOrder){
    const rTH = await getTransactionHistory(id);
    let orderDetail = new tools.orderDetailForm;
    orderDetail.id = id;
    orderDetail.pair = openedOrder.pair;
    orderDetail.type = type;
    switch(type){
        case "BUY":
            orderDetail.price = openedOrder.buy_price;
            orderDetail.size = openedOrder.buy_size;
            orderDetail.funds = openedOrder.buy_price*openedOrder.buy_size;
            break;
        case "SELL":
            orderDetail.price = openedOrder.sell_price;
            orderDetail.size = openedOrder.sell_size;
            orderDetail.funds = openedOrder.sell_size;
            break;
    }
    if(rTH.data.length > 0){
        for(let i=0;i<rTH.data.length;i++){
            orderDetail.size_filled += rTH.data[i].amount;
            orderDetail.fee += rTH.data[i].fee;
        }
        /*
            Convert to 64 bits (8 bytes) (16 decimal digits)
            When sum 0.0001 and 0.0002 we can get this result: 0.00030000000000000003
        */
        orderDetail.size_filled = tools.setPrecision(orderDetail.size_filled, 16);
        orderDetail.fee = tools.setPrecision(orderDetail.fee, 16);
        if(orderDetail.size === orderDetail.size_filled){
            orderDetail.status = "fulfilled";
        } else {
            orderDetail.status = "partially_filled";
        }
    } else {
        orderDetail.status = "canceled";
    }
    return {"s": true, "data": orderDetail};
};

let cancelOrder = function (id, type, openedOrder){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/cancelOrder',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "orderId=" + id + "&" + sign()
        }, async function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    if(result.data){
                        const detailCanceledOrder = await getOrder(id, type, openedOrder);
                        resolve({"s":1, "data": detailCanceledOrder.data});
                    } else {
                        resolve({"s":0, "data": {"error": "not found"}});
                    }
                } else {
                    console.error(body);
                    resolve({s:0, data: {"error": response.statusCode}});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, data: {error: "getTicker"}});
            }
        });
    });
};

let createOrder = async function (pair, type, pendingSellOrder, price){
    let size = "";
    switch(type){
        case "BUY":
            size = tools.getBuyOrderSize(pair, price);
            return await buyLimitOrder(pair.name, size, price);
        case "SELL":
            size = pendingSellOrder.sell_size.toString();
            return await sellLimitOrder(pair.name, size, price);
    }
};
let buyLimitOrder = function (currencyPair, amount, price){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/buyLimit',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "currencyPair=" + currencyPair + "&amount=" + amount + "&price=" +price + "&" + sign()
        }, function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    if(result.error){
                        if(result.errorMessage.includes("Minimum Order Size")){
                            resolve({s:0, errorMessage: "insufficient size"});
                        } else {
                            resolve({s:0, errorMessage: result.errorMessage});
                        }
                    } else {
                        let createdOrder = new tools.orderCreatedForm;
                        createdOrder.id = result.data;
                        createdOrder.price = price;
                        createdOrder.size = amount;
                        createdOrder.funds = amount * price;
                        resolve({s: 1, data: createdOrder});
                    }
                } else {
                    console.error(body);
                    resolve({s:0, errorMessage: result});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, errorMessage: "buyLimitOrder"});
            }
        });
    });
};

let sellLimitOrder = function (currencyPair, amount, price){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/sellLimit',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "currencyPair=" + currencyPair + "&amount=" + amount + "&price=" +price + "&" + sign()
        }, function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    if(result.error){
                        if(result.errorMessage.includes("Minimum Order Size")){
                            resolve({s:0, errorMessage: "insufficient size"});
                        } else {
                            resolve({s:0, errorMessage: result.errorMessage});
                        }
                    } else {
                        let createdOrder = new tools.orderCreatedForm;
                        createdOrder.id = result.data;
                        createdOrder.price = price;
                        createdOrder.size = amount;
                        createdOrder.funds = amount*price;
                        resolve({s:1, data: createdOrder});
                    }
                } else {
                    console.error(body);
                    resolve({s:0, errorMessage: result});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, errorMessage: "sellLimitOrder"});
            }
        });
    });
};


let getTransactionHistory = function (orderId ){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/transactionHistory',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "orderId=" + orderId + "&" + sign()
        }, function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    resolve({s:1, data: result.data});
                } else {
                    console.error(body);
                    resolve({s:0, data: result.errorMessage});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, data: {error: "getTransactionHistory"}});
            }
        });
    });
};

/* Get my actual open orders waiting on FILLED*/
let getOpenOrders = function (currencyPair){
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

let getOrderHistory = function (currencyPair, limit){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/orderHistory',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "currencyPair=" + currencyPair + "&limit=" + limit + "&" + sign()
        }, function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    resolve({s:1, data: result});
                } else {
                    console.error(body);
                    resolve({s:0, data: result});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, data: {error: "getOrderHistory"}});
            }
        });
    });
};

module.exports = {
    setConfig: setConfig,
    getBalance: getBalance,
    getTicker: getTicker,
    parseTicker: parseTicker,
    getOrder: getOrder,
    cancelOrder: cancelOrder,
    createOrder: createOrder,
};

