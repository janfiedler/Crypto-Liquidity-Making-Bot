let config = require('../config');
let bitfinex = require('./exchanges/bitfinex');

let getBitfinexTickers = function(){
    return new Promise(async function (resolve) {
        let tickersBitfinex = {};
        let tickersList = "";
        for(let i=0;i<config.exchanges.coinfalcon.pairs.length;i++){
            tickersList += config.exchanges.coinfalcon.pairs[i].bitfinexTicker+",";
        }
        const tickersResult = await bitfinex.getTickers(tickersList);
        if(tickersResult.s){
            for(let i=0;i<config.exchanges.coinfalcon.pairs.length;i++){
                let tickerPair = config.exchanges.coinfalcon.pairs[i].name;
                tickersBitfinex[tickerPair] = {bid: 0, ask: 0};
                tickersBitfinex[tickerPair].bid = parseFloat(tickersResult.body[i][1].toFixed(config.exchanges.coinfalcon.pairs[i].digitsPrice));
                tickersBitfinex[tickerPair].ask = parseFloat(tickersResult.body[i][3].toFixed(config.exchanges.coinfalcon.pairs[i].digitsPrice));
            }
            resolve({s: 1, data: tickersBitfinex});
        } else {
            resolve({s: 0});
        }
    });
};

let parseBalance = function(config, funds){
    let myAccount = {[config.name]: {balance: {},available: {}}};
    switch (config.name) {
        case "coinfalcon":
            for (const fund of funds.data) {
                let currencyCode = fund.currency_code.toLocaleUpperCase();
                if(config.accounts.some(currency => currency.name.toLocaleUpperCase() === currencyCode)){
                    myAccount[config.name].balance[currencyCode] = parseFloat(fund.balance);
                    myAccount[config.name].available[currencyCode] = parseFloat(fund.available_balance);
                }
            }
            break;
        case "coinmate":
            for (const account of config.accounts) {
                let currencyCode = account.name.toLocaleUpperCase();
                if(funds.data[currencyCode]){
                    myAccount[config.name].balance[currencyCode] = parseFloat(funds.data[currencyCode].balance);
                    myAccount[config.name].available[currencyCode] = parseFloat(funds.data[currencyCode].available);
                }
            }
            break;
    }
    return myAccount;
};

let addPipsToPrice = function(price, pips, digits){
    return Math.round((price+(pips/Math.pow(10, digits)))*Math.pow(10, digits))/Math.pow(10, digits);
};

let takePipsFromPrice = function(price, pips, digits){
    return Math.round((price-(pips/Math.pow(10, digits)))*Math.pow(10, digits))/Math.pow(10, digits);
};

let getProfitTargetPrice = function (price, percentage, digits){
    //Round a number upward
    return price+(Math.ceil(((percentage / 100) * price)*Math.pow(10,digits))/Math.pow(10, digits));
};

let convertPipsToPrice = function (pips, digits){
    return Math.round((pips/Math.pow(10, digits))*Math.pow(10, digits))/Math.pow(10, digits);
};
//precision
let setPrecision = function(value, digits){
    return Math.round(value*Math.pow(10, digits))/Math.pow(10, digits);
};
// Set precision with round a number upward to its nearest integer
let setPrecisionUp = function(value, digits){
    return Math.ceil(value*Math.pow(10, digits))/Math.pow(10, digits);
};
let setPrecisionDown = function(value, digits){
    return Math.floor(value*Math.pow(10, digits))/Math.pow(10, digits);
};

let getBuyOrderSize = function(pair, price){
    let size = pair.buySize;
    if(size === 0){
        size = setPrecisionDown((pair.buyForAmount/price), pair.digitsSize);
    }
    return size;
};

let sleep = function (ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
};
let orderDetailForm  = function(){
   return {"id": "", "pair": "", "type": "", "funds": 0, "price": 0,  "size": 0, "size_filled": 0, "fee": 0, "status": ""};
};
let orderCreatedForm = function(){
    return {"id": "", "price": 0, "size": 0, "funds": 0, "created_at": new Date().toISOString()};
};

module.exports = {
    parseBalance: parseBalance,
    addPipsToPrice: addPipsToPrice,
    takePipsFromPrice: takePipsFromPrice,
    getProfitTargetPrice: getProfitTargetPrice,
    getBuyOrderSize: getBuyOrderSize,
    convertPipsToPrice: convertPipsToPrice,
    setPrecision: setPrecision,
    setPrecisionUp: setPrecisionUp,
    setPrecisionDown: setPrecisionDown,
    sleep: sleep,
    orderDetailForm: orderDetailForm,
    orderCreatedForm: orderCreatedForm
};
