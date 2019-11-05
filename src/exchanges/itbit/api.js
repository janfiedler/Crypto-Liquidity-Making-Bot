var request = require('request');
const crypto = require('crypto');
let _ = require("underscore"),
    util = require('util'),
    VError = require('verror');
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
    this.timeout = 20000;  // milli seconds

    // initialize nonce to current unix time in seconds
    this.nonce = (new Date()).getTime();
};

function makePublicRequest(version, path, args) {
    var functionName = 'ItBit.makePublicRequest()';

    var params = Object.keys(args).reduce(function(a,k){a.push(k+'='+encodeURIComponent(args[k]));return a},[]).join('&');
    if (params) path = path + "?" + params;

    var server;
    if (version === 'v1') {
        server = self.serverV1;
    }
    else if (version === 'v2') {
        server = self.serverV2;
    }
    else {
        return Promise.reject(new VError('%s version %s needs to be either v1 or v2', functionName, version));
    }

    var options = {
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
        return Promise.reject(new VError("%s must provide key and secret to make a private API request.", functionName))
    }

    var uri = self.serverV1 + path;

    // compute the post data
    var postData = "";
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
    return new Promise(function (resolve, reject) {
        request(options, function (err, res, body) {
            //console.log(err);
            //console.log(res.statusCode);
            //console.log(body);
            let error = null;   // default to no errors
            let errorMessage = null;

            if (err) {
                errorMessage = util.format('%s failed %s', functionName, requestDesc);
                error = {error: true, statusCode: res.statusCode, data: errorMessage};
                console.log(new Date().toISOString() + "\n" + JSON.stringify(error));
                resolve(error);
            }
            else if (!body) {
                errorMessage = util.format('%s failed %s. Not response from server', functionName, requestDesc);
                error = {error: true, statusCode: res.statusCode, data: errorMessage};
                console.log(new Date().toISOString() + "\n" + JSON.stringify(error));
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
            }
            resolve({error: false, statusCode: res.statusCode, data: body});
        });
    });
}

let getBalance = async function(){
    if(config.walletId === null){
        const wallets = await getWallets(config.userId);
        if(!wallets.error && wallets.statusCode === 200){
            walletId = wallets.data[0].id;
            return wallets.data[0];
        }
    } else {
        return await getWallet(config.walletId);
    }
};

let getWallets = function (userId) {
    return makePrivateRequest("GET", "/wallets", {userId: userId});
};

let getWallet = function (walletId) {
    return makePrivateRequest("GET", "/wallets/" + walletId, {});
};

let getTicker = async function(pair) {
    const tickers = await makePublicRequest('v1', "/markets/" + pair.name.replace('-','') + "/order_book", {});
    //console.log(tickers);
    if(!tickers.error && tickers.statusCode === 200){
        return {s:1, data: tickers.data, counter: 1};
    }
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
    price = (Math.round(price * 4) / 4).toFixed(2);
    switch(type){
        case "BUY":
            size = tools.getBuyOrderSize(pair, valueForSize, price).toString();
            if(size > 0){
                return await limitOrder(type, pair, size, price);
            } else {
                return {s:0, errorMessage: "Size order not set in config."};
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
            amount: size.toString(),
            price: price.toString(),
            instrument: pair.name.replace('-',''),
            "postOnly": true
        };
        const limitOrderResult = await makePrivateRequest("POST", "/wallets/" + walletId + "/orders", args);
        console.log("limitOrder");
        console.log(limitOrderResult);
        if(!limitOrderResult.error && limitOrderResult.statusCode === 201){
            let createdOrder = new tools.orderCreatedForm;
            createdOrder.id = limitOrderResult.data.id;
            createdOrder.price = parseFloat(limitOrderResult.data.price);
            createdOrder.size = parseFloat(limitOrderResult.data.amount);
            createdOrder.funds = tools.setPrecision(createdOrder.price*createdOrder.size, pair.digitsPrice);
            resolve({s:1, data: createdOrder});
        } else if(limitOrderResult.error) {
            resolve({s:0, errorMessage: limitOrderResult.data});
        }

    });
};

let getOrder = function(pair, id, type, openedOrder){
    return new Promise(async function (resolve) {
        const getOrderResult = await makePrivateRequest("GET", "/wallets/" + walletId + "/orders/" + id, {});
        if(!getOrderResult.error && getOrderResult.statusCode === 200){
            console.log("getOrder");
            console.log(getOrderResult);
            let detailOrder = new tools.orderDetailForm;
            detailOrder.id = getOrderResult.data.id;
            detailOrder.pair = pair.name;
            detailOrder.type = type;
            detailOrder.price = parseFloat(getOrderResult.data.price);
            detailOrder.size = parseFloat(getOrderResult.data.amount);
            detailOrder.funds = tools.setPrecision(detailOrder.price*detailOrder.size, pair.digitsPrice);
            detailOrder.size_filled = parseFloat(getOrderResult.data.amountFilled);
            detailOrder.fee = 0;
            detailOrder.status = getOrderResult.data.status;
            resolve({s:1, data: detailOrder});
        } else if(getOrderResult.error && getOrderResult.statusCode === 404) {
            //The order matching the provided id is not open
            resolve({s:0, data: {error: "itbit cancelOrder"}});
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
        console.log("cancelOrder");
        console.log(cancelResult);
        if(!cancelResult.error && cancelResult.statusCode === 202){
            if(cancelResult.data.message.includes('Success') || cancelResult.data.message.includes('Order already cancelled')){
                //Because cancel order do not response with order detail, we need request order detail in next step
                resolve({s:0, data: {error: "not found"}});
            } else {
                resolve({s:0, data: {error: "itbit cancelOrder failed"}});
            }

        } else if(cancelResult.error && cancelResult.statusCode === 422) {
            //The order matching the provided id is not open
            resolve({s:0, data: {error: "not found"}});
        } else if(cancelResult.error && cancelResult.statusCode === 404) {
            //The order matching the provided id is not open
            resolve({s:0, data: {error: "itbit cancelOrder failed"}});
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


