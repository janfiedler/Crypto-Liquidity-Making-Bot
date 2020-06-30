var request = require('request');
const crypto = require('crypto');
let _ = require("underscore"),
    cheerio = require('cheerio'),
    util = require('util');
const tools = require('../../tools');
let config;
let options = {};


let setConfig = async function(data){
    config = data;
    //const limitOrderResult = await api('AddOrder', { "pair": "XXMRZEUR", "type": "buy", "ordertype": "limit", "price": "60", "volume": 0.1, "oflags": "fciq,post" });
    //console.log(limitOrderResult);
    //const getOrderResult = await api('QueryOrders', {"txid": "OMV52L-GH4WW-73YWRU"});
    //console.log(JSON.stringify(getOrderResult));
};

// Public/Private method names
const methods = {
    public  : [ 'Time', 'Assets', 'AssetPairs', 'Ticker', 'Depth', 'Trades', 'Spread', 'OHLC' ],
    private : [ 'Balance', 'TradeBalance', 'OpenOrders', 'ClosedOrders', 'QueryOrders', 'TradesHistory', 'QueryTrades', 'OpenPositions', 'Ledgers', 'QueryLedgers', 'TradeVolume', 'AddOrder', 'CancelOrder', 'DepositMethods', 'DepositAddresses', 'DepositStatus', 'WithdrawInfo', 'Withdraw', 'WithdrawStatus', 'WithdrawCancel' ],
};

// Create a signature for a request
const getMessageSignature = (path, request, secret, nonce) => {
    //console.error(path);
    //console.error(request);
    const message       = Object.keys(request).reduce(function(a,k){a.push(k+'='+encodeURIComponent(request[k]));return a},[]).join('&');
    const secret_buffer = new Buffer(secret, 'base64');
    const hash          = new crypto.createHash('sha256');
    const hmac          = new crypto.createHmac('sha512', secret_buffer);
    const hash_digest   = hash.update(nonce + message).digest('binary');
    const hmac_digest   = hmac.update(path + hash_digest, 'binary').digest('base64');

    return hmac_digest;
};

// Send an API request
const rawRequest = async (url, headers, data, timeout) => {

    headers['User-Agent'] = 'Kraken Javascript API Client';

    const options = { headers, timeout };

    Object.assign(options, {
        method : 'POST',
        body   : Object.keys(data).reduce(function(a,k){a.push(k+'='+encodeURIComponent(data[k]));return a},[]).join('&'),
    });
    //console.error(options);

    let functionName = 'kraken.executeRequest()', requestDesc;

    if (options.method === 'GET') {
        requestDesc = util.format('%s request to url %s',
            options.method, url);
    } else {
        requestDesc = util.format('%s request to url %s with nonce %s and data %s',
            options.method, url, data.nonce, JSON.stringify(data));
    }

    return new Promise(function (resolve, reject) {
        // Set custom User-Agent string
        request.post(url, options, async function (err, res, body) {
            let error = null;   // default to no errors
            let errorMessage = null;
            //console.log(body);
            if (err) {
                errorMessage = util.format('%s failed %s', functionName, requestDesc);
                console.log(errorMessage);
                error = {error: true, statusCode: -1, data: errorMessage};
                console.error(new Date().toISOString() + "\n" + JSON.stringify(error));
                resolve(error);
            }
            else if(!res){
                errorMessage = util.format('%s failed %s. Invalid response from server', functionName, requestDesc);
                error = {error: true, statusCode: -1, data: errorMessage};
                console.error(new Date().toISOString() + "\n" + JSON.stringify(error));
                resolve(error);
            }
            else if (!body) {
                errorMessage = util.format('%s failed %s. Not response from server', functionName, requestDesc);
                error = {error: true, statusCode: res.statusCode, data: errorMessage};
                console.error(new Date().toISOString() + "\n" + JSON.stringify(error));
                resolve(error);
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
                resolve({error: false, statusCode: res.statusCode, data: JSON.parse(body)});
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
    /*
        const { body } = await got(url, options);
        const response = JSON.parse(body);

        if(response.error && response.error.length) {
            const error = response.error
                .filter((e) => e.startsWith('E'))
                .map((e) => e.substr(1));

            if(!error.length) {
                throw new Error("Kraken API returned an unknown error");
            }

            throw new Error(error.join(', '));
        }

        return response;

     */
};

/**
 * This method makes a public or private API request.
 * @param  {String}   method   The API method (public or private)
 * @param  {Object}   params   Arguments to pass to the api call
 * @param  {Function} callback A callback function to be executed when the request is complete
 * @return {Object}            The request object
 */
async function api(method, params, callback) {
    // Default params to empty object
    if(typeof params === 'function') {
        callback = params;
        params   = {};
    }

    if(methods.public.includes(method)) {
        return await publicMethod(method, params, callback);
    }
    else if(methods.private.includes(method)) {
        return await privateMethod(method, params, callback);
    }
    else {
        throw new Error(method + ' is not a valid API method.');
    }
}

/**
 * This method makes a public API request.
 * @param  {String}   method   The API method (public or private)
 * @param  {Object}   params   Arguments to pass to the api call
 * @param  {Function} callback A callback function to be executed when the request is complete
 * @return {Object}            The request object
 */
async function publicMethod(method, params, callback) {
    params = params || {};

    // Default params to empty object
    if(typeof params === 'function') {
        callback = params;
        params   = {};
    }

    const path     = '/0/public/' + method;
    const url      = config.url + path;
    const response = await rawRequest(url, {}, params, 5000);

    if(typeof callback === 'function') {
        response
            .then((result) => callback(null, result))
            .catch((error) => callback(error, null));
    }

    return response;
}

/**
 * This method makes a private API request.
 * @param  {String}   method   The API method (public or private)
 * @param  {Object}   params   Arguments to pass to the api call
 * @param  {Function} callback A callback function to be executed when the request is complete
 * @return {Object}            The request object
 */
async function privateMethod(method, params, callback) {
    params = params || {};

    // Default params to empty object
    if(typeof params === 'function') {
        callback = params;
        params   = {};
    }

    const path = '/0/private/' + method;
    const url  = config.url + path;

    if(!params.nonce) {
        params.nonce = new Date() * 1000; // spoof microsecond
    }

    const signature = getMessageSignature(
        path,
        params,
        config.secretKey,
        params.nonce
    );

    const headers = {
        'API-Key'  : config.apiKey,
        'API-Sign' : signature,
    };

    const response = await rawRequest(url, headers, params, 5000);

    if(typeof callback === 'function') {
        response
            .then((result) => callback(null, result))
            .catch((error) => callback(error, null));
    }

    return response;
}

let getBalance = function(){
    // Display user's balance
    return new Promise(async function (resolve) {
        let balance = await api('Balance');
        //console.log(balance);
        if(!balance.error && balance.data.error.length === 0 && balance.statusCode === 200){
            resolve(balance.data.result);
        }
    });
};

let getTradeBalance = function(){
    // Display user's balance
    return new Promise(async function (resolve) {
        let tradeBalance = await api('TradeBalance', { asset  : "ZEUR"});
        //console.log(tradeBalance);
        if(!tradeBalance.error && tradeBalance.data.error.length === 0 && tradeBalance.statusCode === 200){
            resolve(tradeBalance.data.result);
        }
    });
};

let getTicker = async function(pair) {
    const tickers = await api('Depth', { pair : pair.name.replace(pair.separator,''), count: 10 });
    //console.log(tickers);
    //console.log(tickers.data.result[pair.name.replace(pair.separator,'')]);

    if(!tickers.error && tickers.data.error.length === 0 && tickers.statusCode === 200){
        return {s:1, data: tickers.data.result[pair.name.replace(pair.separator,'')], counter: 2};
    } else if (!tickers.error && tickers.data.error.length > 0  && tickers.statusCode === 200){
        return {s:0, data: tickers.data.error[0], counter: 2};
    } else if (tickers.error){
        return {s:0, data: tickers.data.result, counter: 2};
    }
};

let parseTicker = async function(type, book, pair, order){
    let ticks = {bid:[],bidBorder: 0, ask:[], askBorder:0};
    let ii=0;
    for(let i=0;i<book.asks.length;i++){
        if(i===0){
            ticks.askBorder = parseFloat(book.asks[i][0]);
        }
        if(type === "ask"){
            if(typeof order !== 'undefined' && order.hasOwnProperty('sell_price') && parseFloat(book.asks[i][0]) === order.sell_price){
                //It is important be always the best price. We dont know if we was first who placing order at this price. Also we can be in deeper book, than will be stucked here.
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
                //It is important be always the best price. We dont know if we was first who placing order at this price.
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
    //console.log(ticks);
    return ticks;
};

let createOrder = async function(pair, type, pendingSellOrder, valueForSize, price){
    let size = "";
    switch(type){
        case "BUY":
            size = tools.getBuyOrderSize(pair, valueForSize, price).toString();
            if(size > 0){
                return await limitOrder(type.toLowerCase(), pair, size, price);
            } else {
                return {s:0, data:{error: "Size order not set in config."}};
            }
        case "SELL":
            size = pendingSellOrder.sell_size.toString();
            return await limitOrder(type.toLowerCase(), pair, size, price);
    }
};

let limitOrder = async function(type, pair, size, price){
    const limitOrderResult = await api('AddOrder', { "pair": pair.name.replace(pair.separator,''), "type": type, "ordertype": "limit", "price": price, "volume": size, "oflags": "fciq,post" });
    //console.log(limitOrderResult);

    if(!limitOrderResult.error && limitOrderResult.statusCode === 200){
        if(limitOrderResult.data.error.length > 0) {
            return {s:0, counter: 9999999, data: {error: JSON.stringify(limitOrderResult.data.error[0])}};
        } else if(limitOrderResult.data.error.length === 0){
            let createdOrder = new tools.orderCreatedForm;
            createdOrder.id = limitOrderResult.data.result.txid[0];
            createdOrder.price = parseFloat(limitOrderResult.data.result.descr.order.split(" ")[5]);
            createdOrder.size = parseFloat(limitOrderResult.data.result.descr.order.split(" ")[1]);
            createdOrder.funds = tools.setPrecision(createdOrder.price*createdOrder.size, pair.digitsPrice);
            //console.log(createdOrder);
            return {s:1, counter:0, data: createdOrder};
        } else {
            await tools.sleep(9999999);
        }
    } else if (limitOrderResult.error){
        return {s:0, data:  {error: limitOrderResult.error}, counter: 999999};
    }
};

let getOrder = async function(pair, id, type, openedOrder){

    const getOrderResult = await api('QueryOrders', {"txid": id});
    //console.log(JSON.stringify(getOrderResult));

    if(!getOrderResult.error && getOrderResult.statusCode === 200){
        if(getOrderResult.data.error.length > 0){
            return {s:0, counter: 10, data: {error: getOrderResult.data.error[0]}};
        } else if( getOrderResult.data.error.length === 0 && getOrderResult.data.result[id].status === "canceled" || getOrderResult.data.result[id].status === "closed"){
            let detailOrder = new tools.orderDetailForm;
            detailOrder.id = id;
            detailOrder.pair = pair.name;
            detailOrder.type = type;
            //Check if is price for filled order, if not use value from opening order in description pf result
            const orderResultPrice = parseFloat(getOrderResult.data.result[id].price);
            if(orderResultPrice === 0){
                detailOrder.price = parseFloat(getOrderResult.data.result[id].descr.price);
            } else {
                detailOrder.price = orderResultPrice;
            }
            detailOrder.size = parseFloat(getOrderResult.data.result[id].vol);
            detailOrder.funds = tools.setPrecision(detailOrder.price*detailOrder.size, pair.digitsPrice);
            detailOrder.size_filled = parseFloat(getOrderResult.data.result[id].vol_exec);
            //If fee = 0 because of bad kraken rounding. Still fee is deducted. Use own calculation based on estimated fees.
            if(parseFloat(getOrderResult.data.result[id].fee) === 0){
                detailOrder.fee = tools.getPercentage(config.fees.maker, (detailOrder.price*detailOrder.size_filled), 10);
            } else {
                detailOrder.fee = parseFloat(getOrderResult.data.result[id].fee);
            }
            detailOrder.status = getOrderResult.data.result[id].status;

            //console.log(detailOrder);
            return {s:1, counter: 2, data: detailOrder};
        } else {
            // Order not closed yet, repeat
            return {s:0, counter: 10, data: {error: ""}};
        }
    } else {
        console.error("kraken getOrder");
        console.error(body);
        console.error(JSON.stringify(openedOrder));
        console.error(id);
        return {s:0, counter: 2, data: {error: JSON.stringify(result)}};
    }
};

let cancelOrder = async function(pair, id, type, openedOrder){

    const cancelOrderResult = await api('CancelOrder', {"txid": id});
    //console.log(cancelOrderResult);

    if(!cancelOrderResult.error && cancelOrderResult.statusCode === 200){
        if(cancelOrderResult.data.error.length > 0) {
            if(cancelOrderResult.data.error[0].includes("EOrder:Unknown order")){
                console.error("The order matching the provided id is not open");
                //The order matching the provided id is not open
                return {s:0, counter:0, data: {error: "not found"}};
            } else if (cancelOrderResult.data.error[0].includes("WOrder:Cancel pending")) {
                //Cancel order is not processed, send not found, to try get detail if still pending than next will be repeated cancel order.
                return {s:0, counter: 0, data: {error: "not found"}};
            } else {
                return {s:0, counter: 9999999, data: {error: JSON.stringify(cancelOrderResult.data.error[0])}};
            }
        } else if (cancelOrderResult.data.result.hasOwnProperty('count') && cancelOrderResult.data.result.count === 1) {
            //Because cancel order do not response with order detail, we need request order detail in next step
            return {s:0, counter:0, data: {error: "not found"}};
        } else {
            return {s:0, counter: 30, data: {error: JSON.stringify(cancelOrderResult.error)}};
        }
    } else {
        return {s:0, counter: 30, data: {error: JSON.stringify(cancelOrderResult.error)}};
    }
};


module.exports = {
    setConfig: setConfig,
    getBalance: getBalance,
    getTradeBalance: getTradeBalance,
    getTicker: getTicker,
    parseTicker: parseTicker,
    createOrder: createOrder,
    getOrder: getOrder,
    cancelOrder: cancelOrder,
};


