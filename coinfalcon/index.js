let env = process.env.NODE_ENV || 'development';
let config = require('../config')[env];

const crypto = require('crypto');
var request = require('request');

exports.getPriceIOTEUR = function(level) {
    return new Promise(function (resolve) {
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
        request.get({url: "https://coinfalcon.com/api/v1/markets/IOT-EUR/orders", qs: { level: level.toString() }}, function(error, response, body) {
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
    const hmac = crypto.createHmac('sha256', config.coinfalcon.CD_API_SECRET_KEY);
    hmac.update(payload);
    let signature = hmac.digest('hex');
    return {"CF-API-KEY": config.coinfalcon.CF_API_KEY, "CF-API-TIMESTAMP": timestamp, "CF-API-SIGNATURE": signature};
};

exports.getAccountsBalance = function(){
    return new Promise(function (resolve) {
        let request_path = "/api/v1/user/accounts";
        let url = config.coinfalcon.url + request_path;
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

exports.getOrders = function(status){
    return new Promise(function (resolve) {
        let request_path = "/api/v1/user/orders?market=IOT-EUR&status="+status;
        let url = config.coinfalcon.url + request_path;
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

exports.cancelOrder = function(type, myAccount){
    return new Promise(function (resolve) {
        let orderId;
        if(type === "sell"){
            orderId = myAccount.sellId;
        } else if(type === "buy"){
            orderId = myAccount.buyId;
        }
        let request_path = "/api/v1/user/orders/"+orderId;
        let url = config.coinfalcon.url + request_path;
        request.delete({url: url, headers : sign("DELETE", request_path, {})}, async function (error, response, body) {
            //const result = JSON.parse(body);
            //console.log(result);
            if (!error && response.statusCode === 200) {
                //const result = JSON.parse(body);
                if(type === "sell"){
                    myAccount.sellId = "";
                    myAccount.sellPrice = 0.0000;
                    myAccount.availableIOT = myAccount.balanceIOT + myAccount.availableIOT;
                } else if(type === "buy"){
                    myAccount.buyId = "";
                    myAccount.buyPrice = 0.0000;
                    myAccount.availableEUR = myAccount.balanceEUR + myAccount.availableEUR;
                }
                resolve(myAccount);
            } else {
                resolve(myAccount);
            }
        });

    });
};

exports.createOrder = function(order_type, myAccount, price, funds){
    return new Promise(function (resolve) {
        let size = "";
        switch(order_type){
            case "buy":
                size = (Math.floor((funds/price)*100000)/100000).toString();
                break;
            case "sell":
                size = funds.toString();
                break;
        }
        let body = { market: 'IOT-EUR', operation_type: 'limit_order', order_type: order_type, price: price.toString(), size: size, post_only: "false" };
        let request_path = "/api/v1/user/orders";
        let url = config.coinfalcon.url + request_path;
        let o1 = { 'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json' };

        let headers = Object.assign(o1, sign("POST", request_path, body));

        request.post({url: url, headers: headers, form: body}, function(error, response, body) {
            const result = JSON.parse(body);
            //console.log(result.data);
            if (!error && response.statusCode === 201) {
                switch(result.data.order_type){
                    case "buy":
                        myAccount.buyId = result.data.id;
                        myAccount.buyPrice = parseFloat(result.data.price);
                        break;
                    case "sell":
                        myAccount.sellId = result.data.id;
                        myAccount.sellPrice = parseFloat(result.data.price);
                        break;
                }
            }
            resolve(myAccount);
        });
    });
};
