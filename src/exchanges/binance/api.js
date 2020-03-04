var request = require('request');
const crypto = require('crypto');
const tools = require('../../tools');
let config;
let options = {};
let db;

let setConfig = function(data, database){
    return new Promise(async function (resolve) {
        config = data;
        db = database;
        request.get({url: config.url + "/api/v1/time"}, async function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    options.timeOffset = result.serverTime - new Date().getTime();
                    resolve(true);
                } else {
                    console.error("binance time");
                    console.error(body);
                }
            } catch (e) {
                console.error(body);
                console.error(e);
            }
        });
    });
};

let sign = function(totalParams) {
    totalParams.timestamp = new Date().getTime() + options.timeOffset;
    let query = Object.keys(totalParams).reduce(function(a,k){a.push(k+'='+encodeURIComponent(totalParams[k]));return a},[]).join('&');
    //config.debug && console.log(query);
    const hmac = crypto.createHmac('sha256', config.secretKey);
    hmac.update(query);
    totalParams.signature = hmac.digest('hex');
    return {"headers": {"X-MBX-APIKEY": config.apiKey}, "totalParams": totalParams};
};

let getBalance = function(){
    return new Promise(async function (resolve) {
        //Waiting function to prevent reach api limit
        const url = config.url + "/api/v3/account";
        const signed = sign({});
        request.get({url: url, headers : signed.headers, qs: signed.totalParams}, async function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    resolve({s:1, data: result.balances});
                } else {
                    console.error("binance getBalance");
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

let getTicker = function(pair) {
    return new Promise(async function (resolve) {
        /*
            Response schema type: object

            [Object]	bids
            Aggregated bids.

            String	bids[].price
            String	bids[].size
            [Object]	asks
            Aggregated asks.

            String	asks[].price
            String	asks[].size
        */
        request.get({url: config.url + "/api/v1/depth", qs: { "symbol": pair.name.replace(pair.separator,''), "limit": 20 }}, function(error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    //accountTransfer(config.name, pair, pair.name.split(pair.separator)[1], 1 , "fromSpot");
                    //accountTransfer(config.name, pair, pair.name.split(pair.separator)[1], 1 , "fromMargin");
                    //db.updateFunding(config.name, pair, 1, "borrow");
                    resolve({s:1, data: result, counter: 1});
                } else {
                    console.error("binance getTicker");
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
};

let parseTicker = function(type, book, pair, order){
    let ticks = {bid:[],bidBorder: 0, ask:[], askBorder:0};
    let ii=0;
    for(let i=0;i<book.asks.length;i++){
        if(i===0){
            ticks.askBorder = parseFloat(book.asks[i][0]);
        }
        if(type === "ask"){
            if(typeof order !== 'undefined' && order.hasOwnProperty('sell_price') && parseFloat(book.asks[i][0]) === order.sell_price){
                const askSizeDiff = (parseFloat(book.asks[i][1])-order.sell_size);
                if( askSizeDiff > pair.strategy.ignoreOrderSize){
                    ticks.ask.push({price: parseFloat(book.asks[i][0]), size: tools.setPrecision(askSizeDiff, pair.digitsSize)});
                    ii++;
                }
            } else if( parseFloat(book.asks[i][1]) > pair.strategy.ignoreOrderSize){
                ticks.ask.push({price: parseFloat(book.asks[i][0]), size: parseFloat(book.asks[i][1])});
                ii++;
            }
        } else {
            break;
        }
    }
    ii=0;
    for(let i=0;i<book.bids.length;i++){
        if(i === 0){
            ticks.bidBorder = parseFloat(book.bids[i][0]);
        }
        if(type === "bid"){
            if(typeof order !== 'undefined' && order.hasOwnProperty('buy_price') && parseFloat(book.bids[i][0]) === order.buy_price){
                const bidSizeDiff = (parseFloat(book.bids[i][1])-order.buy_size);
                if( bidSizeDiff > pair.strategy.ignoreOrderSize){
                    ticks.bid.push({price: parseFloat(book.bids[i][0]), size: tools.setPrecision(bidSizeDiff, pair.digitsSize)});
                    ii++;
                } else {
                    //console.log("My position "+book.bids[i][0]+" was alone (Lets process ask fornot counted ignored), removed from ticks.");
                }
            } else if(parseFloat(book.bids[i][1]) > pair.strategy.ignoreOrderSize){
                ticks.bid.push({price: parseFloat(book.bids[i][0]), size: parseFloat(book.bids[i][1])});
                ii++;
            }
        } else {
            break;
        }
    }
    return ticks;
};

let createOrder = async function(pair, type, pendingSellOrder, valueForSize, price){
    let size = "";
    switch(type){
        case "BUY":
            size = tools.getBuyOrderSize(pair, valueForSize, price).toString();
            if(size > 0){
                return await limitOrder(type, pair, size, price);
            } else {
                return {s:0, data:{error: "Size order not set in config."}};
            }
        case "SELL":
            size = pendingSellOrder.sell_size.toString();
            return await limitOrder(type, pair, size, price);
    }
};

let limitOrder = function(type, pair, size, price){
    return new Promise(async function (resolve) {
        let url = config.url + "/api/v3/order";

        let body = { "symbol": pair.name.replace(pair.separator,''), "side": type, "type": "LIMIT_MAKER", "quantity": size, "price": price, "newOrderRespType": "FULL" };
        const signed = sign(body);

        request.post({url: url, headers : signed.headers, qs: signed.totalParams}, async function(error, response, body) {
            try {
                const result = JSON.parse(body);
                console.error("### createOrder " + type);
                console.error(result);
                if (!error && response.statusCode === 200 && result.status === "NEW") {
                    let createdOrder = new tools.orderCreatedForm;
                    createdOrder.id = result.clientOrderId;
                    createdOrder.price = parseFloat(result.price);
                    createdOrder.size = parseFloat(result.origQty);
                    createdOrder.funds = tools.setPrecision(createdOrder.price*createdOrder.size, pair.digitsPrice);
                    resolve({s:1, counter:1, data: createdOrder});
                } else if(!error && response.statusCode === 200){
                    resolve({s:0, counter:1, data: {"error": "unknown status"}});
                } else {
                    console.error("binance limitOrder");
                    console.error(body);
                    const errMsg = JSON.stringify(result.msg);
                    if(errMsg.includes("Order would immediately match and take")){
                        resolve({s:0, counter:1, data: {error: "rejected"}});
                    } else {
                        resolve({s:0, counter:1, data: {error: errMsg}});
                    }

                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, counter:1, data: {error: body}});
            }
        });
    });
};

let getOrder = function(pair, id, type, openedOrder){
    return new Promise(async function (resolve) {
        let url = config.url + "/api/v3/order";
        let body = { "symbol": pair.name.replace(pair.separator,''), "origClientOrderId": id};
        const signed = sign(body);

        request.get({url: url, headers : signed.headers, qs: signed.totalParams}, async function (error, response, body) {
            try {
                const result = JSON.parse(body);
                if (!error && response.statusCode === 200) {
                    let detailOrder = new tools.orderDetailForm;
                    detailOrder.id = result.clientOrderId;
                    detailOrder.pair = pair.name;
                    detailOrder.type = type;
                    detailOrder.price = parseFloat(result.price);
                    detailOrder.size = parseFloat(result.origQty);
                    detailOrder.funds = tools.setPrecision(detailOrder.price*detailOrder.size, pair.digitsPrice);
                    detailOrder.size_filled = parseFloat(result.executedQty);
                    detailOrder.fee = tools.getPercentage(config.fees.maker, (detailOrder.price*detailOrder.size_filled), 10);
                    detailOrder.status = result.status;
                    resolve({s:1, counter: 1, data: detailOrder});
                } else {
                    console.error("binance getOrder");
                    console.error(body);
                    resolve({s:0, counter: 1, data: {error: JSON.stringify(result)}});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, counter: 1, data: {error: "getOrder"}});
            }
        });
    });
};

let cancelOrder = function(pair, id, type, openedOrder){
    return new Promise(async function (resolve) {
        let url = config.url + "/api/v3/order";
        let body = { "symbol": pair.name.replace(pair.separator,''), "origClientOrderId": id};
        const signed = sign(body);

        request.delete({url: url, headers : signed.headers, qs: signed.totalParams}, async function (error, response, body) {
            try {
                const result = JSON.parse(body);
                console.error("### cancelOrder");
                console.error(result);
                if (!error && response.statusCode === 200 && result.status === "CANCELED") {
                    let detailOrder = new tools.orderDetailForm;
                    detailOrder.id = result.origClientOrderId;
                    detailOrder.pair = pair.name;
                    detailOrder.type = type;
                    detailOrder.price = parseFloat(result.price);
                    detailOrder.size = parseFloat(result.origQty);
                    detailOrder.funds = tools.setPrecision(detailOrder.price*detailOrder.size, pair.digitsPrice);
                    detailOrder.size_filled = parseFloat(result.executedQty);
                    detailOrder.fee = tools.getPercentage(config.fees.maker, (detailOrder.price*detailOrder.size_filled), 10);
                    detailOrder.status = result.status;
                    resolve({s:1, counter:1, data: detailOrder});
                } else if(!error && response.statusCode === 200){
                    resolve({s:0, counter:1, data: {"error": "unknown status"}});
                } else {
                    console.error("binance cancelOrder");
                    console.error(body);
                    resolve({s:0, counter:1, data: {"error": "not found"}});
                }
            } catch (e) {
                console.error(body);
                console.error(e);
                resolve({s:0, counter:1, data: {error: "cancelOrder"}});
            }
        });

    });
};

let accountTransfer = function(exchange, pair, amount, type){
    return new Promise(async function (resolve) {
        let url = config.url + "/sapi/v1/margin/transfer";
        if(type === "fromSpot"){
            // Transfer from spot to margin.
            type = 1;
        } else if(type === "fromMargin"){
            // Transfer from margin to spot.
            type = 2;
        }
        let body = { "asset": pair.name.split(pair.separator)[1], "amount": amount, "type": type};
        const signed = sign(body);

        request.post({url: url, headers : signed.headers, qs: signed.totalParams}, async function(error, response, body) {
            try {
                const result = JSON.parse(body);
                console.error("### accountTransfer");
                console.error(result);
                if(result.tranId){
                    resolve(result.tranId);
                } else {
                    console.error(body);
                    console.error(e);
                }
            } catch (e) {
                console.error(body);
                console.error(e);
            }
        });
    });
};

let marginBorrow = function(exchange, pair, amount){
    return new Promise(async function (resolve) {
        let url = config.url + "/sapi/v1/margin/loan";
        let body = { "asset": pair.name.split(pair.separator)[1], "amount": amount};
        const signed = sign(body);

        request.post({url: url, headers : signed.headers, qs: signed.totalParams}, async function(error, response, body) {
            try {
                const result = JSON.parse(body);
                console.error("### marginBorrow" );
                console.error(result);
                if(result.tranId){
                    resolve(result.tranId);
                } else {
                    console.error(body);
                    console.error(e);
                }
            } catch (e) {
                console.error(body);
                console.error(e);
            }
        });
    });
};

let marginRepay  = function(exchange, pair, amount){
    return new Promise(async function (resolve) {
        let url = config.url + "/sapi/v1/margin/repay";
        let body = { "asset": pair.name.split(pair.separator)[1], "amount": amount};
        const signed = sign(body);

        request.post({url: url, headers : signed.headers, qs: signed.totalParams}, async function(error, response, body) {
            try {
                const result = JSON.parse(body);
                console.error("### marginRepay");
                console.error(result);
                if(result.tranId){
                    resolve(result.tranId);
                } else {
                    console.error(body);
                    console.error(e);
                }
            } catch (e) {
                console.error(body);
                console.error(e);
            }
        });
    });
};

module.exports = {
    setConfig: setConfig,
    getBalance: getBalance,
    getTicker: getTicker,
    parseTicker: parseTicker,
    createOrder: createOrder,
    getOrder: getOrder,
    cancelOrder: cancelOrder,
    accountTransfer: accountTransfer,
    marginBorrow: marginBorrow,
    marginRepay: marginRepay,

};


