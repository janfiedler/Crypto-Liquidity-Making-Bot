var request = require('request');
const crypto = require('crypto');
let _ = require("underscore"),
    cheerio = require('cheerio'),
    util = require('util');
const tools = require('../../tools');
let config;
let options = {};
let nonce = new Date().getTime();
let serverV1 = "https://api.itbit.com/v1";
let serverV2 = "https://www.itbit.com/api/v2";
/*
    Big thanks to
    https://github.com/naddison36/itbit/blob/master/itbit.js
 */
let walletId = "";
var self;
let setConfig = function(data){
    config = data;
    self = this;

    this.key = config.clientKey;
    this.secret = config.clientSecret;

    this.serverV1 = "https://api.itbit.com/v1";
    this.serverV2 = "https://www.itbit.com/api/v2";
    this.timeout = 60000;  // milli seconds

    // initialize nonce to current unix time in seconds
    this.nonce = (new Date()).getTime();
};

function makePublicRequest(version, path, args) {
    let functionName = 'ItBit.makePublicRequest()';

    let params = Object.keys(args).reduce(function(a,k){a.push(k+'='+encodeURIComponent(args[k]));return a},[]).join('&');
    if (params) path = path + "?" + params;

    let server;
    if (version === 'v1') {
        server = self.serverV1;
    }
    else if (version === 'v2') {
        server = self.serverV2;
    }
    else {
        return Promise.reject(new Error(util.format('%s version %s needs to be either v1 or v2', functionName, version)));
    }

    let options = {
        method: "GET",
        uri: server + path,
        headers: {
            "User-Agent": "itBit node.js client",
            "Content-type": "application/x-www-form-urlencoded"
        },
        json: args
    };

    return executeRequest(options);
}

function makePrivateRequest(method, path, args) {
    var functionName = "ItBit.makePrivateRequest()";

    if (!self.key || !self.secret) {
        return Promise.reject(new Error(util.format("%s must provide key and secret to make a private API request.", functionName)));
    }

    let uri = self.serverV1 + path;

    // compute the post data
    let postData = "";
    if (method === 'POST' || method === 'PUT') {
        postData = JSON.stringify(args);
    }
    else if (method === "GET" && !_.isEmpty(args)) {
        //uri += "?" + querystring.stringify(args);
        let query = Object.keys(args).reduce(function(a,k){a.push(k+'='+encodeURIComponent(args[k]));return a},[]).join('&');
        uri += "?" + query;
    }

    var timestamp = (new Date()).getTime();
    var nonce = self.nonce++;

    // message is concatenated string of nonce and JSON array of secret, method, uri, json_body, nonce, timestamp
    var message = nonce + JSON.stringify([method, uri, postData, nonce.toString(), timestamp.toString()]);

    var hashBuffer = crypto
        .createHash("sha256")
        .update(message).digest();

    var bufferToHash = Buffer.concat([Buffer.from(uri), hashBuffer]);

    var signer = crypto.createHmac("sha512", self.secret);

    var signature = signer
        .update(bufferToHash)
        .digest("base64");

    var options = {
        method: method,
        uri: uri,
        headers: {
            "User-Agent": "itBit node.js client",
            Authorization: self.key + ':' + signature,
            "X-Auth-Timestamp": timestamp,
            "X-Auth-Nonce": nonce
        },
        json: args,
        timeout: self.timeout
    };

    return executeRequest(options);
}

function executeRequest(options) {
    let functionName = 'ItBit.executeRequest()', requestDesc;

    if (options.method === 'GET') {
        requestDesc = util.format('%s request to url %s',
            options.method, options.uri);
    } else {
        requestDesc = util.format('%s request to url %s with nonce %s and data %s',
            options.method, options.uri, options.headers["X-Auth-Nonce"], JSON.stringify(options.json));
    }
    //console.log("### executeRequest");
    //console.log(options);
    //console.log(requestDesc);
    return new Promise(function (resolve, reject) {
        request(options, function (err, res, body) {
            let error = null;   // default to no errors
            let errorMessage = null;
            /*
            if(JSON.stringify(options).includes("Authorization")){
                let resStatus = 0;
                if(typeof res.statusCode !== 'undefined' && res.statusCode){resStatus = res.statusCode}
                console.log("### executeRequest" + "\n" + new Date().toISOString() + "\n" + JSON.stringify(options) + "\n" +  + JSON.stringify(requestDesc) + "\n" +  + JSON.stringify(err) + "\n" + resStatus + "\n" + JSON.stringify(body));
            }
            */
            if (err) {
                errorMessage = util.format('%s failed %s', functionName, requestDesc);
                console.log(errorMessage);
                error = {error: true, statusCode: -2, data: errorMessage};
                console.error(new Date().toISOString() + "\n" + JSON.stringify(options) + "\n" + JSON.stringify(error) + "\n" + JSON.stringify(err) + "\n" + JSON.stringify(body) + "\n" + JSON.stringify(res));
                //List of found errors when failed GET request
                //err = {"code":"ESOCKETTIMEDOUT","connect":false} No opened order found on itbit exchange
                resolve(error);
            }
            else if(!res){
                errorMessage = util.format('%s failed %s. Invalid response from server', functionName, requestDesc);
                error = {error: true, statusCode: -1, data: errorMessage};
                console.error(new Date().toISOString() + "\n" + JSON.stringify(options) + "\n" + JSON.stringify(error) + "\n" + JSON.stringify(err) + "\n" + JSON.stringify(body) + "\n" + JSON.stringify(res));
                resolve(error);
            }
            else if (!body) {
                errorMessage = util.format('%s failed %s. Not response from server', functionName, requestDesc);
                error = {error: true, statusCode: res.statusCode, data: errorMessage};
                console.error(new Date().toISOString() + "\n" + JSON.stringify(options) + "\n" + JSON.stringify(error) + "\n" + JSON.stringify(err) + "\n" + JSON.stringify(body) + "\n" + JSON.stringify(res));
                resolve(error);
            }
            // if request was not able to parse json response into an object
            else if (!_.isObject(body)) {
                // try and parse HTML body form response
                $ = cheerio.load(body);

                var responseBody = $('body').text();

                if (responseBody) {
                    errorMessage = util.format('%s could not parse response body from %s\nResponse body: %s', functionName, requestDesc, responseBody);
                    error = {error: true, statusCode: res.statusCode, data: errorMessage};
                    console.error(new Date().toISOString() + "\n" + JSON.stringify(error));
                    resolve(error);
                }
                else {
                    errorMessage = util.format('%s could not parse json or HTML response from %s', functionName, requestDesc);
                    error = {error: true, statusCode: res.statusCode, data: errorMessage};
                    console.error(new Date().toISOString() + "\n" + JSON.stringify(error));
                    resolve(error);
                }
            }
            // the following is to trap the JSON response
            // {"error":"The itBit API is currently undergoing maintenance"}
            else if (body && body.error) {
                errorMessage = util.format('%s failed %s. Error %s', functionName,
                    requestDesc, body.error);
                error = {error: true, statusCode: res.statusCode, data: errorMessage};
                console.error(new Date().toISOString() + "\n" + JSON.stringify(error));
                resolve(error);
            }
            else if (body && body.code) {
                errorMessage = util.format('%s failed %s. Error code %s, description: %s', functionName,
                    requestDesc, body.code, body.description);
                error = {error: true, statusCode: res.statusCode, data: errorMessage};
                console.error(new Date().toISOString() + "\n" + JSON.stringify(error));
                resolve(error);
            }
            else if (!(res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 202)) {
                errorMessage = util.format('%s failed %s. Response status code %s, response body %s', functionName,
                    requestDesc, res.statusCode, res.body);
                error = {error: true, statusCode: res.statusCode, data: errorMessage};
                console.error(new Date().toISOString() + "\n" + JSON.stringify(error));
                resolve(error);
            } else if(body && res.statusCode){
                resolve({error: false, statusCode: res.statusCode, data: body});
            } else {
                console.error(new Date().toISOString() + "\n" + JSON.stringify(err));
                console.error(new Date().toISOString() + "\n" + JSON.stringify(body));
                console.error(new Date().toISOString() + "\n" + JSON.stringify(res));
                errorMessage = util.format('%s failed %s', functionName, requestDesc);
                error = {error: true, statusCode: -1, data: errorMessage};
                resolve(error);
            }

        });
    });
}

let getBalance = async function(){
    if(config.walletId === null){
        const wallets = await getWallets(config.userId);
        console.log(JSON.stringify(wallets));
        if(!wallets.error && wallets.statusCode === 200){
            walletId = wallets.data[0].id;
            return wallets.data[0];
        }
    } else {
        const wallet = await getWallet(config.walletId);
        console.log(JSON.stringify(wallet));
        if(!wallet.error && wallet.statusCode === 200){
            walletId = config.walletId;
            return wallet.data;
        }
    }
};

let getWallets = function (userId) {
    return makePrivateRequest("GET", "/wallets", {userId: userId});
};

let getWallet = function (walletId) {
    return makePrivateRequest("GET", "/wallets/" + walletId, {});
};

let getTicker = async function(pair) {
    const tickers = await makePublicRequest('v1', "/markets/" + pair.name.replace(pair.separator,'') + "/order_book", {});
    //console.log(tickers);
    if(!tickers.error && tickers.statusCode === 200){
        return {s:1, data: tickers.data, counter: 1};
    } else if (tickers.error){
        return {s:0, data: tickers.data, counter: 1};
    }
};

let parseTicker = function(type, book, pair, order){
    let ticks = {bid:[],bidBorder: 0, ask:[], askBorder:0};
    ticks.askBorder = parseFloat(book.asks[0][0]);
    if(type === "ask"){
        for(let i=0;(i<book.asks.length) && (i<25);i++) {
            if (typeof order !== 'undefined' && order.hasOwnProperty('sell_price') && parseFloat(book.asks[i][0]) === order.sell_price) {
                const askSizeDiff = (parseFloat(book.asks[i][1]) - order.sell_size);
                if (askSizeDiff > pair.strategy.ignoreOrderSize) {
                    ticks.ask.push({
                        price: parseFloat(book.asks[i][0]),
                        size: tools.setPrecision(askSizeDiff, pair.digitsSize)
                    });
                }
            } else if (parseFloat(book.asks[i][1]) > pair.strategy.ignoreOrderSize) {
                ticks.ask.push({price: parseFloat(book.asks[i][0]), size: parseFloat(book.asks[i][1])});
            }
        }
    }

    ticks.bidBorder = parseFloat(book.bids[0][0]);
    if(type === "bid"){
        for(let i=0;(i<book.bids.length) && (i<25);i++) {
            if (typeof order !== 'undefined' && order.hasOwnProperty('buy_price') && parseFloat(book.bids[i][0]) === order.buy_price) {
                const bidSizeDiff = (parseFloat(book.bids[i][1]) - order.buy_size);
                if (bidSizeDiff > pair.strategy.ignoreOrderSize) {
                    ticks.bid.push({
                        price: parseFloat(book.bids[i][0]),
                        size: tools.setPrecision(bidSizeDiff, pair.digitsSize)
                    });
                } else {
                    //console.log("My position "+book.bids[i][0]+" was alone (Lets process ask fornot counted ignored), removed from ticks.");
                }
            } else if (parseFloat(book.bids[i][1]) > pair.strategy.ignoreOrderSize) {
                ticks.bid.push({price: parseFloat(book.bids[i][0]), size: parseFloat(book.bids[i][1])});
            }
        }
    }
    //console.log(ticks);
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
                return {s:0, data: {error: "Size order not set in config."}};
            }
        case "SELL":
            size = pendingSellOrder.sell_size.toString();
            return await limitOrder(type, pair, size, price);
    }
};

let limitOrder = function (type, pair, size, price) {
    return new Promise(async function (resolve) {
        let args = {
            side: type,
            type: "limit",
            currency: pair.name.split(pair.separator)[0],
            amount: parseFloat(size).toFixed(pair.digitsSize),
            price: parseFloat(price).toFixed(pair.digitsPrice),
            instrument: pair.name.replace(pair.separator,''),
            "postOnly": true
        };
        const limitOrderResult = await makePrivateRequest("POST", "/wallets/" + walletId + "/orders", args);
        //console.log("limitOrder");
        //console.log(limitOrderResult);
        //console.error("### createOrder " + type);
        //console.error(limitOrderResult.statusCode);
        //console.error(limitOrderResult.data);
        if(!limitOrderResult.error && limitOrderResult.statusCode === 201 && limitOrderResult.data.status === "submitted"){
            let createdOrder = new tools.orderCreatedForm;
            createdOrder.id = limitOrderResult.data.id;
            createdOrder.price = parseFloat(limitOrderResult.data.price);
            createdOrder.size = parseFloat(limitOrderResult.data.amount);
            createdOrder.funds = tools.setPrecision(createdOrder.price*createdOrder.size, pair.digitsPrice);
            resolve({s:1, counter:1, data: createdOrder});
        } else if(!limitOrderResult.error && limitOrderResult.statusCode === 201 && limitOrderResult.data.status === "rejected"){
            resolve({s:0, counter:1, data: {error: "rejected", status: limitOrderResult.data.status, data: limitOrderResult.data}});
        } else if(!limitOrderResult.error && limitOrderResult.statusCode === 201){
            resolve({s:0, counter:30, data: {error: "not_submitted", data: limitOrderResult.data}});
        } else if(limitOrderResult.error && limitOrderResult.statusCode === 422 && JSON.stringify(limitOrderResult.data).includes("Error code 81001")) {
            resolve({s: 0, counter: 30, data: {error: "repeat", reason: "The wallet provided does not have the funds required to place the order!"}});
        } else if(limitOrderResult.error && limitOrderResult.statusCode === 429 && JSON.stringify(limitOrderResult.data).includes("Error Rate limit exceeded")) {
            resolve({s: 0, counter: 30, data: {error: "repeat", reason: "Error Rate limit exceeded, too many requests per minute."}});
        } else if(limitOrderResult.error && limitOrderResult.statusCode === 504) {
            //Need validate last orders on exchange, because when we get timeout, action can be already done on exchange.
            await tools.sleep(30000);
            let revalidate = await getLastOrders(type, pair, parseFloat(size).toFixed(pair.digitsSize), parseFloat(price).toFixed(pair.digitsPrice));
            if(revalidate.s){
                console.error("Order was made, save it and continue");
                let createdOrder = new tools.orderCreatedForm;
                createdOrder.id = revalidate.data.id;
                createdOrder.price = parseFloat(revalidate.data.price);
                createdOrder.size = parseFloat(revalidate.data.amount);
                createdOrder.funds = tools.setPrecision(createdOrder.price*createdOrder.size, pair.digitsPrice);
                console.error(JSON.stringify(createdOrder));
                //resolve({s:1, counter:1, data: createdOrder});
                resolve({s: 0, counter: 30, data: {error: "Not response from server", order: args}});
            } else {
                console.error("Order wasnt made, lets continue");
                resolve({s: 0, counter: 30, data: {error: "Not response from server", order: args}});
            }
        } else if(limitOrderResult.error && limitOrderResult.statusCode === -2) {
            //Need validate last orders on exchange, because when we get timeout, action can be already done on exchange.
            await tools.sleep(30000);
            let revalidate = await getLastOrders(type, pair, parseFloat(size).toFixed(pair.digitsSize), parseFloat(price).toFixed(pair.digitsPrice));
            if(revalidate.s){
                console.error("Order was made, save it and continue");
                let createdOrder = new tools.orderCreatedForm;
                createdOrder.id = limitOrderResult.data.id;
                createdOrder.price = parseFloat(limitOrderResult.data.price);
                createdOrder.size = parseFloat(limitOrderResult.data.amount);
                createdOrder.funds = tools.setPrecision(createdOrder.price*createdOrder.size, pair.digitsPrice);
                console.error(JSON.stringify(createdOrder));
                //resolve({s:1, counter:1, data: createdOrder});
                resolve({s: 0, counter: 30, data: {error: "ESOCKETTIMEDOUT", order: args}});
            } else {
                console.error("Order wasnt made, lets continue");
                resolve({s: 0, counter: 30, data: {error: "ESOCKETTIMEDOUT", order: args}});
            }
        } else if(limitOrderResult.error) {
            resolve({s:0, counter:30, data: {error: JSON.stringify(limitOrderResult.data), order: args}});
        } else {
            console.error(limitOrderResult.statusCode);
            console.error(JSON.stringify(limitOrderResult.data));
        }

    });
};

let getOrder = function(pair, id, type, openedOrder){
    return new Promise(async function (resolve) {
        const getOrderResult = await makePrivateRequest("GET", "/wallets/" + walletId + "/orders/" + id, {});
        //console.error("### getOrder");
        //console.error(getOrderResult.statusCode);
        //console.error(getOrderResult.data);
        if(!getOrderResult.error && getOrderResult.statusCode === 200 && (getOrderResult.data.status === "filled" || getOrderResult.data.status === "cancelled" || getOrderResult.data.status === "rejected") ){
            //console.log("getOrder");
            //console.log(getOrderResult);
            let detailOrder = new tools.orderDetailForm;
            detailOrder.id = getOrderResult.data.id;
            detailOrder.pair = pair.name;
            detailOrder.type = type;
            detailOrder.price = parseFloat(getOrderResult.data.price);
            detailOrder.size = parseFloat(getOrderResult.data.amount);
            detailOrder.funds = tools.setPrecision(detailOrder.price*detailOrder.size, pair.digitsPrice);
            detailOrder.size_filled = parseFloat(getOrderResult.data.amountFilled);
            detailOrder.status = getOrderResult.data.status;

            if(parseFloat(getOrderResult.data.amountFilled) > 0){
                const trades = await makePrivateRequest("GET", "/wallets/" + walletId + "/trades", {orderId:id});
                //console.log("getTrades");
                //console.log(trades);
                if(!trades.error){
                    if(trades.data.tradingHistory.length > 0){
                        for(let i=0;i<trades.data.tradingHistory.length;i++){
                            //console.log("fee");
                            //console.log(parseFloat(trades.data.tradingHistory[i].rebatesApplied));
                            detailOrder.fee -= (parseFloat(trades.data.tradingHistory[i].rebatesApplied));
                        }
                        detailOrder.fee = tools.setPrecision(detailOrder.fee, 8);
                        if(detailOrder.size === detailOrder.size_filled){
                            detailOrder.status = "fulfilled";
                        } else {
                            detailOrder.status = "partially_filled";
                        }
                    }
                    resolve({s:1, counter: 2, data: detailOrder});
                } else {
                    resolve({s:0, counter: 2, data: {error: "itbit getOrderError"}});
                }
            } else {
                detailOrder.fee = 0;
                resolve({s:1, counter: 1, data: detailOrder});
            }
        } else if(!getOrderResult.error && getOrderResult.statusCode === 200 && (getOrderResult.data.status === "submitted" || getOrderResult.data.status === "open" || getOrderResult.data.status === "pendingsubmission")){
            //Order not filled/cancelled yet, need handle it again!
            //console.error("itbit getOrder not filled/canceled");
            //console.error(new Date().toISOString() + "\n" + JSON.stringify(getOrderResult.data));
            //console.error(JSON.stringify(openedOrder));
            //console.error(id);
            resolve({s:0, counter: 10, data: {error: "repeat"}});
        } else if(getOrderResult.error && getOrderResult.statusCode === 404) {
            //The order matching the provided id is not open
            resolve({s:0, counter: 1, data: {error: "itbit getOrderError"}});
        } else if(getOrderResult.error && getOrderResult.statusCode === 429 && JSON.stringify(getOrderResult.data).includes("Error Rate limit exceeded")) {
            resolve({s: 0, counter: 30, data: {error: "repeat", reason: "Error Rate limit exceeded, too many requests per minute."}});
        } else if(getOrderResult.error) {
            resolve({s:0, counter: 30, data: {error: JSON.stringify(getOrderResult.data)}});
        }
    });
};

let getLastOrders = function(type, pair, amount, price){
    return new Promise(async function (resolve) {
        let args = {
            instrument: pair.name.replace(pair.separator,'')
        }
        const getLastOrdersResult = await makePrivateRequest("GET", "/wallets/" + walletId + "/orders/", args);
        if(!getLastOrdersResult.error && getLastOrdersResult.statusCode === 200){
            for(let i=0;i<getLastOrdersResult.data.length;i++){
                if(getLastOrdersResult.data[i].side === type.toLowerCase() && parseFloat(getLastOrdersResult.data[i].amount) === amount && parseFloat(getLastOrdersResult.data[i].price) === price){
                    resolve({s:1, counter: 1, data: getLastOrdersResult.data[i]});
                }
            }
            resolve({s:0, counter:1, data: {error: "not found"}});
        } else {
            console.error("### getLastOrders");
            console.error(getLastOrdersResult.statusCode);
            console.error(getLastOrdersResult.data);
            resolve({s:0, counter:1, data: {error: "not found"}});
        }
    });

};

let cancelOrder = function (pair, id, type, openedOrder){
    return new Promise(async function (resolve) {
        /*const trades = await getWalletTrades({orderId:id});
        console.log("trades");
        console.log(trades);
         */
        const cancelResult = await makePrivateRequest("DELETE", "/wallets/" + walletId + "/orders/" + id, {});
        //console.log("cancelOrder");
        //console.error("### cancelOrder");
        //console.error(cancelResult.statusCode);
        //console.error(cancelResult.data);
        if(!cancelResult.error && cancelResult.statusCode === 202){
            if(cancelResult.data.message.includes('Success') || cancelResult.data.message.includes('Order already cancelled')){
                //Because cancel order do not response with order detail, we need request order detail in next step
                resolve({s:0, counter:1, data: {error: "not found"}});
            } else {
                resolve({s:0, counter:1, data: {error: "itbit cancelOrder failed"}});
            }

        } else if(cancelResult.error && cancelResult.statusCode === 422) {
            //The order matching the provided id is not open
            resolve({s:0, counter:1, data: {error: "not found"}});
        } else if(cancelResult.error && cancelResult.statusCode === 404) {
            //The order matching the provided id is not open
            resolve({s:0, counter:1, data: {error: "itbit cancelOrder failed"}});
        } else if(cancelResult.error && cancelResult.statusCode === 429 && JSON.stringify(cancelResult.data).includes("Error Rate limit exceeded")) {
            resolve({s: 0, counter: 30, data: {error: "repeat", reason: "Error Rate limit exceeded, too many requests per minute."}});
        } else if(cancelResult.error) {
            resolve({s:0, counter: 30, data: {error: JSON.stringify(cancelResult.data)}});
        }
    });
};

let getWalletTrades = function (params) {
    return makePrivateRequest("GET", "/wallets/" + walletId + "/trades", params);
};

module.exports = {
    setConfig: setConfig,
    getBalance: getBalance,
    getTicker: getTicker,
    parseTicker: parseTicker,
    createOrder: createOrder,
    getOrder: getOrder,
    cancelOrder: cancelOrder,
};


