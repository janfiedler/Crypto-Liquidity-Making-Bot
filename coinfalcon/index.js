let env = process.env.NODE_ENV || 'development';
let config = require('../config')[env];

const sleepPause = config.sleepPause;

const crypto = require('crypto');
const tools = require('../src/tools');
var request = require('request');

exports.getTicker = function(pair, level) {
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
        //Waiting function to prevent reach api limit
        await tools.sleep(sleepPause);
        request.get({url: "https://coinfalcon.com/api/v1/markets/"+pair+"/orders", qs: { level: level.toString() }}, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                let info = JSON.parse(body);
                resolve(info);
            }
        });
    });
};

sign = function(method, request_path, body = undefined) {
    let timestamp = Date.now().toString();
    timestamp = parseInt(timestamp.substring(0, timestamp.length - 3), 10);
    let payload = timestamp+"|"+method+"|"+request_path;
    if (body) {
        payload += '|' + JSON.stringify(body);
    }
    //console.log(payload);
    const hmac = crypto.createHmac('sha256', config.exchanges.coinfalcon.CD_API_SECRET_KEY);
    hmac.update(payload);
    let signature = hmac.digest('hex');
    return {"CF-API-KEY": config.exchanges.coinfalcon.CF_API_KEY, "CF-API-TIMESTAMP": timestamp, "CF-API-SIGNATURE": signature};
};

exports.getAccountsBalance = function(){
    return new Promise(async function (resolve) {
        //Waiting function to prevent reach api limit
        await tools.sleep(sleepPause);
        let request_path = "/api/v1/user/accounts";
        let url = config.exchanges.coinfalcon.url + request_path;
        request.get({url: url, headers : sign("GET", request_path)}, async function (error, response, body) {
            if (!error && response.statusCode === 200) {
                resolve(JSON.parse(body));
            } else {
                console.error(JSON.parse(body).error);
            }
        });
    });
};

exports.getOrders = function(pair, status){
    return new Promise(async function (resolve) {
        //Waiting function to prevent reach api limit
        await tools.sleep(sleepPause);
        let request_path = "/api/v1/user/orders?market="+pair+"&status="+status;
        let url = config.exchanges.coinfalcon.url + request_path;
        request.get({url: url, headers : sign("GET", request_path)}, async function (error, response, body) {
            if (!error && response.statusCode === 200) {
                resolve(JSON.parse(body));
            } else {
                //throw 'Error';
                console.error(error);
                //console.log('Error getProxyTotalHashes');
            }
        });
    });
};

exports.getOrder = function(id){
    return new Promise(async function (resolve) {
        //Waiting function to prevent reach api limit
        await tools.sleep(sleepPause);
        let request_path = "/api/v1/user/orders/"+id;
        let url = config.exchanges.coinfalcon.url + request_path;
        request.get({url: url, headers : sign("GET", request_path)}, async function (error, response, body) {
            if (!error && response.statusCode === 200) {
                resolve(JSON.parse(body));
            } else {
                //throw 'Error';
                console.error(error);
                //console.log('Error getProxyTotalHashes');
            }
        });
    });
};

exports.cancelOrder = function(id){
    return new Promise(async function (resolve) {
        //Waiting function to prevent reach api limit
        await tools.sleep(sleepPause);
        let request_path = "/api/v1/user/orders/"+id;
        let url = config.exchanges.coinfalcon.url + request_path;
        request.delete({url: url, headers : sign("DELETE", request_path, {})}, async function (error, response, body) {
            const result = JSON.parse(body);
            //console.log(result);
            if (!error && response.statusCode === 200) {
                resolve({s: 1, data: result.data});
            } else {
                resolve({s:0, data: result});
            }
        });

    });
};

exports.createOrder = function(order_type, pair, myAccount, price){
    return new Promise(async function (resolve) {
        //Waiting function to prevent reach api limit
        await tools.sleep(sleepPause);
        let size = "";
        switch(order_type){
            case "buy":
                size = (Math.ceil((pair.buyForAmount/price)*Math.pow(10, pair.digitsSize))/Math.pow(10, pair.digitsSize)).toString();
                break;
            case "sell":
                size = myAccount.coinfalcon.sellData[pair.name].size.toString();
                break;
        }
        let body = { market: pair.name, operation_type: 'limit_order', order_type: order_type, price: price.toString(), size: size, post_only: "false" };
        let request_path = "/api/v1/user/orders";
        let url = config.exchanges.coinfalcon.url + request_path;
        let o1 = { 'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json' };

        let headers = Object.assign(o1, sign("POST", request_path, body));
        request.post({url: url, headers: headers, form: body}, function(error, response, body) {
            const result = JSON.parse(body);
            if (!error && response.statusCode === 201) {
                //console.log(result.data);
                switch(result.data.order_type){
                    case "buy":
                        myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(result.data.size);
                        myAccount.coinfalcon.buyData[pair.name].id = result.data.id;
                        myAccount.coinfalcon.buyData[pair.name].price = parseFloat(result.data.price);
                        myAccount.coinfalcon.buyData[pair.name].size = parseFloat(result.data.size);
                        myAccount.coinfalcon.buyData[pair.name].funds = parseFloat(result.data.funds);
                        myAccount.coinfalcon.buyData[pair.name].created_at = result.data.created_at;
                        break;
                    case "sell":
                        myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(result.data.size);
                        myAccount.coinfalcon.sellData[pair.name].id = result.data.id;
                        myAccount.coinfalcon.sellData[pair.name].price = parseFloat(result.data.price);
                        myAccount.coinfalcon.sellData[pair.name].size = parseFloat(result.data.size);
                        myAccount.coinfalcon.sellData[pair.name].funds = parseFloat(result.data.funds);
                        myAccount.coinfalcon.sellData[pair.name].created_at = result.data.created_at;
                        break;
                }
            } else {
                console.error(result);
            }
            resolve(myAccount);
        });
    });
};

exports.parseCoinfalconTicker = function(coinfalconOrders, pair){
    //console.log(coinfalconOrders);
    let ticksCoinfalcon = {bidBorder: 0, bid: 0, bidSize: 0, bidSecond: 0, bidSecondSize: 0, askBorder: 0, ask: 0, askSize: 0, askSecond: 0, askSecondSize: 0};
    let ii=0;
    for(let i=0;i<coinfalconOrders.data.asks.length;i++){
        if(i===0){
            ticksCoinfalcon.askBorder = parseFloat(coinfalconOrders.data.asks[i].price);
        }
        if( parseFloat(coinfalconOrders.data.asks[i].size) > pair.ignoreOrderSize){
            ii++;
            if(ii === 1){
                ticksCoinfalcon.ask = parseFloat(coinfalconOrders.data.asks[i].price);
                ticksCoinfalcon.askSize = parseFloat(coinfalconOrders.data.asks[i].size);
            } else if (ii === 2){
                ticksCoinfalcon.askSecond = parseFloat(coinfalconOrders.data.asks[i].price);
                ticksCoinfalcon.askSecondSize = parseFloat(coinfalconOrders.data.asks[i].size);
                break;
            }
        }
    }
    ii=0;
    for(let i=0;i<coinfalconOrders.data.bids.length;i++){
        if(i === 0){
            ticksCoinfalcon.bidBorder = parseFloat(coinfalconOrders.data.bids[i].price);
        }
        if(parseFloat(coinfalconOrders.data.bids[i].size) > pair.ignoreOrderSize){
            ii++;
            if(ii === 1){
                ticksCoinfalcon.bid = parseFloat(coinfalconOrders.data.bids[i].price);
                ticksCoinfalcon.bidSize = parseFloat(coinfalconOrders.data.bids[i].size);
            } else if (ii === 2){
                ticksCoinfalcon.bidSecond = parseFloat(coinfalconOrders.data.bids[i].price);
                ticksCoinfalcon.bidSecondSize = parseFloat(coinfalconOrders.data.bids[i].size);
                break;
            }
        }
    }
    return ticksCoinfalcon;
};
