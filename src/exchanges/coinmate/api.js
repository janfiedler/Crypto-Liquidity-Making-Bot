let request = require('request');
const crypto = require('crypto');
const tools = require('../../tools');
let config;
let Pusher = require('pusher-js');
let coinmatePusher = new Pusher('af76597b6b928970fbb0', {
    encrypted: true
});
let pusher_order_book = [];
let order_book = [];

let setGetOrdersListByPusher = function(){
    return new Promise(function (resolve) {
        for(let i=0;i<config.pairs.length;i++){
            if(config.pairs[i].active.buy || config.pairs[i].active.sell){
                if(typeof pusher_order_book[config.pairs[i].name] === 'undefined'){
                    pusher_order_book[config.pairs[i].name] = coinmatePusher.subscribe('order_book-' + config.pairs[i].name);
                    console.log("subscribe " + config.pairs[i].name);
                    pusher_order_book[config.pairs[i].name].bind('order_book', function(data) {
                        if(config.debug){
                            console.log("New data for " + config.pairs[i].name);
                        }
                        order_book[config.pairs[i].name] = data;
                    });
                }
            }
        }
        resolve(true);
    });
};

let cancelPusher = function(){
    for(let i=0;i<Object.keys(pusher_order_book).length;i++){
        console.log("unsubscribe " + Object.keys(pusher_order_book)[i]);
        coinmatePusher.unsubscribe('order_book-' + Object.keys(pusher_order_book)[i]);
    }
};

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
                    console.error("coinmate getBalance");
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
let getTicker = async function (pair){
    if(config.pusher){
        if(typeof order_book[pair.name] === 'undefined'){
            console.error(pair.name + " waiting on order book!");
            await tools.sleep(1000);
            return {s:0, data: null, counter: 0};
        } else {
            return {s:1, data: order_book[pair.name], counter: 0};
        }
    } else {
        return new Promise(function (resolve) {
            request('https://coinmate.io/api/orderBook?currencyPair='+pair.name+'&groupByPriceLimit=false', function (error, response, body) {
                try {
                    const result = JSON.parse(body);
                    if (!error && response.statusCode === 200) {
                        resolve({s:1, data: result, counter: 1});
                    } else {
                        console.error(body);
                        resolve({s:0, data: result, counter: 1});
                    }
                } catch (e) {
                    console.error(body);
                    console.error(e);
                    resolve({s:0, data: {error: "getTicker"}, counter: 1});
                }
            });
        });
    }
};
let parseTicker = function(type, book, pair, order){
    if(config.pusher){
        return parsePusherTicker(type, book, pair, order);
    } else {
        return parseApiTicker(type, book, pair, order);
    }
};
let parseApiTicker = function(type, book, pair, order){
    let ticks = {bid:[],bidBorder: 0, ask:[], askBorder:0};
    let ii=0;
    for(let i=0;i<book.data.asks.length;i++){
        if(i===0){
            ticks.askBorder = parseFloat(book.data.asks[i].price);
        }
        if(type === "ask"){
            if(typeof order !== 'undefined' && order.hasOwnProperty('sell_price') && parseFloat(book.data.asks[i].price) === order.sell_price){
                const askSizeDiff = (parseFloat(book.data.asks[i].amount)-order.sell_size);
                if( askSizeDiff > pair.strategy.ignoreOrderSize){
                    ticks.ask.push({price: parseFloat(book.data.asks[i].price), size: tools.setPrecision(askSizeDiff, pair.digitsSize)});
                    ii++;
                }
            } else if( parseFloat(book.data.asks[i].amount) > pair.strategy.ignoreOrderSize){
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
                if( bidSizeDiff > pair.strategy.ignoreOrderSize){
                    ticks.bid.push({price: parseFloat(book.data.bids[i].price), size: tools.setPrecision(bidSizeDiff, pair.digitsSize)});
                    ii++;
                } else {
                    //console.log("My position "+book.data.bids[i].price+" was alone (Lets process ask fornot counted ignored), removed from ticks.");
                }
            } else if(parseFloat(book.data.bids[i].amount) > pair.strategy.ignoreOrderSize){
                ticks.bid.push({price: parseFloat(book.data.bids[i].price), size: parseFloat(book.data.bids[i].amount)});
                ii++;
            }
        } else {
            break;
        }
    }
    return ticks;
};

let parsePusherTicker = function(type, book, pair, order){
    let ticks = {bid:[],bidBorder: 0, ask:[], askBorder:0};
    let ii=0;
    for(let i=0;i<book.asks.length;i++){
        if(i===0){
            ticks.askBorder = parseFloat(book.asks[i].price);
        }
        if(type === "ask"){
            if(typeof order !== 'undefined' && order.hasOwnProperty('sell_price') && parseFloat(book.asks[i].price) === order.sell_price){
                const askSizeDiff = (parseFloat(book.asks[i].amount)-order.sell_size);
                if( askSizeDiff > pair.strategy.ignoreOrderSize){
                    ticks.ask.push({price: parseFloat(book.asks[i].price), size: tools.setPrecision(askSizeDiff, pair.digitsSize)});
                    ii++;
                }
            } else if( parseFloat(book.asks[i].amount) > pair.strategy.ignoreOrderSize){
                ticks.ask.push({price: parseFloat(book.asks[i].price), size: parseFloat(book.asks[i].amount)});
                ii++;
            }
        } else {
            break;
        }
    }
    ii=0;
    for(let i=0;i<book.bids.length;i++){
        if(i === 0){
            ticks.bidBorder = parseFloat(book.bids[i].price);
        }
        if(type === "bid"){
            if(typeof order !== 'undefined' && order.hasOwnProperty('buy_price') && parseFloat(book.bids[i].price) === order.buy_price){
                const bidSizeDiff = (parseFloat(book.bids[i].amount)-order.buy_size);
                if( bidSizeDiff > pair.strategy.ignoreOrderSize){
                    ticks.bid.push({price: parseFloat(book.bids[i].price), size: tools.setPrecision(bidSizeDiff, pair.digitsSize)});
                    ii++;
                } else {
                    //console.log("My position "+book.bids[i].price+" was alone (Lets process ask fornot counted ignored), removed from ticks.");
                }
            } else if(parseFloat(book.bids[i].amount) > pair.strategy.ignoreOrderSize){
                ticks.bid.push({price: parseFloat(book.bids[i].price), size: parseFloat(book.bids[i].amount)});
                ii++;
            }
        } else {
            break;
        }
    }
    return ticks;
};

let getOrder = async function (pair, id, type, openedOrder){
    const rTH = await getTradeHistory(id);
    if(rTH.s){
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
        if(typeof rTH.data.length === 'undefined' || rTH.data.length === null){
            console.error(rTH);
            console.error("openedOrder:");
            console.error(openedOrder);
            console.error("id: " + id);
        } else if(rTH.data.length > 0){
            orderDetail.price = parseFloat(rTH.data[0].price);
            if(type === "BUY"){
                orderDetail.funds = tools.setPrecision(orderDetail.price*openedOrder.buy_size, pair.digitsPrice);
            }
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
        return {s: 1, counter: 1, data: orderDetail};
    } else {
        return {s: 0, counter: 1, data: {error: JSON.stringify(rTH.errorMessage)}};
    }
};

let cancelOrder = function (pair, id, type, openedOrder){
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
                        //Because success cancel order do not response with order detail, we need request order detail in next step
                        resolve({s:0, counter:1, data: {error: "not found"}});
                    } else if(!result.data) {
                        //Because faild cancel order, we need response with order detail, we need request order detail in next step
                        resolve({s:0, counter:1, data: {error: "not found"}});
                    } else {
                        resolve({s:0, counter:1, data: {error: "cancelOrder failed"}});
                    }
                } else {
                    console.error("coinmate cancelOrder");
                    console.error(body);
                    resolve({s:0, counter:1, data: {error: JSON.stringify(response.statusCode)}});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, counter:1, data: {error: "coinmate cancelOrder"}});
            }
        });
    });
};

let createOrder = async function (pair, type, pendingSellOrder, valueForSize, price){
    let size = "";
    switch(type){
        case "BUY":
            size = tools.getBuyOrderSize(pair, valueForSize, price);
            if(size > 0){
                return await buyLimitOrder(pair.name, size, price);
            } else {
                return {s:0, data: {error: "Size order not set in config."}};
            }
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
            body: "currencyPair=" + currencyPair + "&amount=" + amount + "&price=" +price + "&postOnly=1" + "&" + sign()
        }, function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    if(result.error){
                        if(result.errorMessage.includes("Minimum Order Size")){
                            resolve({s:0, counter:1, data: {error: "insufficient size"}});
                        } else {
                            resolve({s:0, counter:1, data: {error: JSON.stringify(result.errorMessage)}});
                        }
                    } else {
                        let createdOrder = new tools.orderCreatedForm;
                        createdOrder.id = result.data;
                        createdOrder.price = price;
                        createdOrder.size = amount;
                        createdOrder.funds = amount * price;
                        resolve({s: 1, counter:1, data: createdOrder});
                    }
                } else {
                    console.error("coinmate buyLimitOrder");
                    console.error(body);
                    resolve({s:0, counter:1, data:{error: body}});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, counter:1, data:{error: e.toString()}});
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
            body: "currencyPair=" + currencyPair + "&amount=" + amount + "&price=" +price + "&postOnly=1" + "&" + sign()
        }, function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    if(result.error){
                        if(result.errorMessage.includes("Minimum Order Size")){
                            resolve({s:0, counter:1, data: {error: "insufficient size"}});
                        } else {
                            resolve({s:0, counter:1, data: {error: JSON.stringify(result.errorMessage)}});
                        }
                    } else {
                        let createdOrder = new tools.orderCreatedForm;
                        createdOrder.id = result.data;
                        createdOrder.price = price;
                        createdOrder.size = amount;
                        createdOrder.funds = amount*price;
                        resolve({s:1, counter:1, data: createdOrder});
                    }
                } else {
                    console.error("coinmate sellLimitOrder");
                    console.error(body);
                    resolve({s:0, counter:1, data: {error: body}});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, counter:1, data: {error: body}});
            }
        });
    });
};

let getTradeHistory = function (orderId ){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/tradeHistory',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "orderId=" + orderId + "&" + sign()
        }, function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    if (result.error) {
                        console.error("coinmate getTradeHistory #1");
                        console.error(result);
                        resolve({ s: 0, data: {error: JSON.stringify(result.errorMessage)}});
                    } else {
                        resolve({ s: 1, data: result.data });
                    }
                } else {
                    console.error("coinmate getTradeHistory #2");
                    console.error(body);
                    resolve({s:0, data: {error: JSON.stringify(result.errorMessage)}});
                }
            } catch (e) {
                console.error("getTradeHistory:");
                console.error(body);
                console.error(e);
                resolve({s:0});
            }
        });
    });
};


let getTransactionHistory = function (limit){
    return new Promise(function (resolve) {
        request({
            method: 'POST',
            url: 'https://coinmate.io/api/transactionHistory',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: "sort=DESC&limit=" + limit + "&" + sign()
        }, function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    if (result.error) {
                        console.error("coinmate getTransactionHistory");
                        console.error(result);
                        resolve({ s: 0, data: {error: JSON.stringify(result.errorMessage)}});
                    } else {
                        resolve({ s: 1, data: result.data });
                    }
                } else {
                    console.error("coinmate getTransactionHistory");
                    console.error(body);
                    resolve({s:0, data: result.errorMessage});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0});
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
                    resolve({s:1, data: result.data});
                } else {
                    console.error("coinmate getOrderHistory");
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
    setGetOrdersListByPusher: setGetOrdersListByPusher,
    cancelPusher: cancelPusher,
    getBalance: getBalance,
    getTicker: getTicker,
    parseTicker: parseTicker,
    getOrder: getOrder,
    getTransactionHistory: getTransactionHistory,
    getTradeHistory: getTradeHistory,
    getOrderHistory: getOrderHistory,
    cancelOrder: cancelOrder,
    createOrder: createOrder,
};

