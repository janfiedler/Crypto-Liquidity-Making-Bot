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
                resolve({s:0, data: {error: e.message}});
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
            if(tools.isJSON(body)){
                try {
                    const result = JSON.parse(body);
                    if (!error && response.statusCode === 200) {
                        resolve({s:1, data: result, counter: 1});
                    } else {
                        console.error("binance getTicker");
                        console.error(body);
                        resolve({s:0, data: result, counter: 1});
                    }
                } catch (e) {
                    console.error("binance getTicker");
                    console.error(body);
                    console.error(e);
                    resolve({s:0, data: {error: e.message}, counter: 1});
                }
            } else {
                resolve({s:0, counter:1, data: {error: "repeat", reason: "Response is not JSON Object"}});
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
        console.log("### Binance limitOrder source");
        console.log(body)
        request.post({url: url, headers : signed.headers, qs: signed.totalParams}, async function(error, response, body) {
            if(tools.isJSON(body)){
                try {
                    const result = JSON.parse(body);

                    //console.error("### createOrder " + type);
                    console.log(body+"\r\n"+"##################");
                    if (!error && response.statusCode === 200 && result.status === "NEW") {
                        let createdOrder = new tools.orderCreatedForm;
                        createdOrder.id = result.clientOrderId;
                        createdOrder.price = parseFloat(result.price);
                        createdOrder.size = parseFloat(result.origQty);
                        createdOrder.funds = tools.setPrecision(createdOrder.price*createdOrder.size, pair.digitsPrice);
                        resolve({s:1, counter:1, data: createdOrder});
                    } else if(!error && response.statusCode === 200){
                        resolve({s:0, counter:1, data: {error: "emergency stop", reason: "unknown status"}});
                    } else {
                        console.error("### Binance ERROR limitOrder");
                        console.error(body);
                        const errMsg = JSON.stringify(result.msg);
                        if(errMsg.includes("Order would immediately match and take")){
                            resolve({s:0, counter:1, data: {error: "rejected"}});
                        } else if(errMsg.includes("Timestamp for this request is outside of the recvWindow")){
                            resolve({s:0, counter:1, data: {error: "repeat", reason: "Timestamp for this request is outside of the recvWindow"}});
                        } else if(errMsg.includes("MIN_NOTIONAL")){
                            resolve({s:0, counter:1, data: {error: "insufficient size", reason: errMsg}});
                        } else {
                            resolve({s:0, counter:1, data: {error: "emergency stop", reason: errMsg}});
                        }

                    }
                } catch (e) {
                    console.error("### Binance CATCH ERROR limitOrder");
                    console.error(body);
                    console.error(e);
                    resolve({s:0, counter:1, data: {error: "emergency stop", reason: e.message}});
                }
            } else {
                resolve({s:0, counter:1, data: {error: "repeat", reason: "Response is not JSON Object"}});
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
            if(tools.isJSON(body)){
                try {
                    const result = JSON.parse(body);
                    if (!error && response.statusCode === 200 && (result.status === "PARTIALLY_FILLED")){
                        console.error("### Binance getOrder PARTIALLY_FILLED, api.cancelOrder is pending!");
                        console.error(body);
                        resolve({s:0, counter: 1, data: {error: "repeat", reason: "api.getOrder is still opened! api.cancelOrder is pending!"}});
                    } else if (!error && response.statusCode === 200 && (result.status === "FILLED" || result.status === "CANCELED") ) {
                        console.error("### Binance getOrder");
                        console.error(body);
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
                    } else if (!error && response.statusCode === 200 && result.status === "NEW") {
                        //getOrder is called when cancel order failed due to not found = is filled. But order is still tagged as OPEN
                        console.error("### Binance getOrder not FILLED after not canceled");
                        console.error(body);
                        console.error(JSON.stringify(openedOrder));
                        console.error(id);
                        resolve({s:0, counter: 1, data: {error: "repeat", rason: "not FILLED after not canceled"}});
                    } else if(!error && result.code === -2013 && result.msg.includes("Order does not exist.")){
                        console.error("### Binance getOrder not FOUND after cancel order, probably lag of exchange");
                        console.error(body);
                        console.error(JSON.stringify(openedOrder));
                        console.error(id);
                        resolve({s:0, counter: 1, data: {error: "repeat", reason: "not FOUND after cancel order, probably lag of exchange"}});
                    } else {
                        console.error("### Binance getOrder");
                        console.error(body);
                        console.error(JSON.stringify(openedOrder));
                        console.error(id);
                        resolve({s:0, counter: 1, data: {error: JSON.stringify(result)}});
                    }
                } catch (e) {
                    console.error("### Binance CATCH ERROR getOrder");
                    console.error(body);
                    console.error(e);
                    resolve({s:0, counter: 1, data: {error: e.message}});
                }
            } else {
                resolve({s:0, counter:1, data: {error: "repeat", reason: "Response is not JSON Object"}});
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
            if(tools.isJSON(body)){
                try {
                    const result = JSON.parse(body);
                    console.error("### Binance cancelOrder");
                    console.error(body);
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
                        resolve({s:0, counter:1, data: {error: "emergency stop", reason: "unknown status"}});
                    } else {
                        console.error("### Binance ERROR cancelOrder");
                        console.error(body);
                        const errMsg = JSON.stringify(result.msg);
                        if(errMsg.includes("Unknown order sent")){
                            resolve({s:0, counter:1, data: {"error": "not found"}});
                        } else if(errMsg.includes("Timestamp for this request is outside of the recvWindow")){
                            resolve({s:0, counter:1, data: {error: "repeat", reason: errMsg}});
                        } else if(errMsg.includes("Timestamp for this request was 1000ms ahead of the server's time.")){
                            resolve({s:0, counter:1, data: {error: "repeat", reason: errMsg}});
                        } else {
                            resolve({s:0, counter:1, data: {error: "emergency stop", reason: errMsg}});
                        }
                    }
                } catch (e) {
                    console.error("### Binance CATCH ERROR cancelOrder");
                    console.error(body);
                    console.error(e);
                    //resolve({s:0, counter:1, data: {error: e.message}});
                    resolve({s:0, counter:1, data: {error: "emergency stop", reason: e.message}});
                }
            } else {
                resolve({s:0, counter:1, data: {error: "repeat", reason: "Response is not JSON Object"}});
            }
        });
    });
};

let accountMarginDetail = function(){
    return new Promise(async function (resolve) {
        //Waiting function to prevent reach api limit
        const url = config.url + "/sapi/v1/margin/account";
        const signed = sign({});
        request.get({url: url, headers : signed.headers, qs: signed.totalParams}, async function (error, response, body) {
            if(tools.isJSON(body)){
                try {
                    const result = JSON.parse(body);
                    if (!error && response.statusCode === 200) {
                        resolve({s:1, data: result});
                    } else {
                        console.error("Binance error marginDetail response");
                        console.error(signed);
                        console.error(body);
                        resolve({s:0, counter: 10, data: {error: body}});
                    }
                } catch (e) {
                    console.error("Binance error marginDetail");
                    console.error(signed);
                    console.error(body);
                    console.error(e);
                    resolve({s:0, counter: 10, data: {error: e.message}});
                }
            } else {
                resolve({s:0, counter:1, data: {error: "repeat", reason: "Response is not JSON Object"}});
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
            if(tools.isJSON(body)){
                try {
                    const result = JSON.parse(body);
                    if(result.tranId){
                        resolve({s:1, data: result.tranId});
                    } else {
                        console.error("### Binance error accountTransfer response");
                        console.error(signed);
                        console.error(body);
                        resolve({s:0, counter: 10, data: {error:body}});
                    }
                } catch (error) {
                    console.error("### Binance error accountTransfer");
                    console.error(signed);
                    console.error(body);
                    console.error(error);
                    resolve({s:0, counter: 10, data: {error:error.message}});
                }
            } else {
                resolve({s:0, counter:1, data: {error: "repeat", reason: "Response is not JSON Object"}});
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
            if(tools.isJSON(body)){
                try {
                    const result = JSON.parse(body);
                    if(result.tranId){
                        resolve({s:1, data: result.tranId});
                    } else {
                        console.error("### Binance error marginBorrow response");
                        console.error(signed);
                        console.error(body);
                        resolve({s:0, counter: 10, data: {error:body}});
                    }
                } catch (e) {
                    console.error("### Binance error marginBorrow" );
                    console.error(signed);
                    console.error(body);
                    console.error(error);
                    resolve({s:0, counter: 10, data: {error:error.message}});
                }
            } else {
                resolve({s:0, counter:1, data: {error: "repeat", reason: "Response is not JSON Object"}});
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
            if(tools.isJSON(body)){
                try {
                    const result = JSON.parse(body);
                    if(result.tranId){
                        resolve({s:1, data: result.tranId});
                    } else {
                        console.error("### Binance error marginRepay response");
                        console.error(signed);
                        console.error(body);
                        resolve({s:0, counter: 10, data: {error:body}});
                    }
                } catch (e) {
                    console.error("### Binance error marginRepay" );
                    console.error(signed);
                    console.error(body);
                    console.error(error);
                    resolve({s:0, counter: 10, data: {error:error.message}});
                }
            } else {
                resolve({s:0, counter:1, data: {error: "repeat", reason: "Response is not JSON Object"}});
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
    accountMarginDetail: accountMarginDetail,
    accountTransfer: accountTransfer,
    marginBorrow: marginBorrow,
    marginRepay: marginRepay,

};


