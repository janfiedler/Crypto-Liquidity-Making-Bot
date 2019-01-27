let config = require('../config');
let bitfinex = require('../bitfinex');

exports.getBitfinexTickers = function(){
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

exports.getCoinfalconTicker = function(){
    return new Promise(async function (resolve) {

    });
};

exports.parseBalance = function(funds, myAccount){
    for (const fund of funds.data) {
        let currencyCode = fund.currency_code.toLocaleUpperCase();
        if(config.exchanges.coinfalcon.accounts.some(currency => currency.name.toLocaleUpperCase() === currencyCode)){
            myAccount.coinfalcon.balance[currencyCode] = parseFloat(fund.balance);
            myAccount.coinfalcon.available[currencyCode] = parseFloat(fund.available_balance);
        }
    }
    return myAccount;
};

exports.addPipsToPrice = function(price, pips, digits){
    return Math.round((price+(pips/Math.pow(10, digits)))*Math.pow(10, digits))/Math.pow(10, digits);
};

exports.takePipsFromPrice = function(price, pips, digits){
    return Math.round((price-(pips/Math.pow(10, digits)))*Math.pow(10, digits))/Math.pow(10, digits);
};

exports.getProfitTargetPrice = function (price, percentage, digits){
    //Round a number upward
    return price+(Math.ceil(((percentage / 100) * price)*Math.pow(10,digits))/Math.pow(10, digits));
};

exports.convertPipsToPrice = function (pips, digits){
    return Math.round((pips/Math.pow(10, digits))*Math.pow(10, digits))/Math.pow(10, digits);
};

exports.verifyDigits = function(price, digits){
    return Math.round((price*Math.pow(10, digits))/Math.pow(10, digits))
};

exports.sleep = function (ms){
    return new Promise(resolve=>{
        config.debug && console.log("############# PAUSE");
        setTimeout(resolve,ms)
    })
};