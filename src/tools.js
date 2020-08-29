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
        case "binance":
            for (const fund of funds.data) {
                let currencyCode = fund.asset.toLocaleUpperCase();
                if(config.accounts.some(currency => currency.name.toLocaleUpperCase() === currencyCode)){
                    myAccount[config.name].balance[currencyCode] = parseFloat(fund.locked)+parseFloat(fund.free);
                    myAccount[config.name].available[currencyCode] = parseFloat(fund.free);
                }
            }
            break;
        case "itbit":
            for (const fund of funds.balances) {
                let currencyCode = fund.currency.toLocaleUpperCase();
                if(config.accounts.some(currency => currency.name.toLocaleUpperCase() === currencyCode)){
                    myAccount[config.name].balance[currencyCode] = parseFloat(fund.totalBalance);
                    myAccount[config.name].available[currencyCode] = parseFloat(fund.availableBalance);
                }
            }
            break;
        case "kraken":
            let keys = Object.keys(funds);
            for(let i=0; i<keys.length; i++){
                let currencyCode = keys[i];
                if(config.accounts.some(currency => currency.name.toLocaleUpperCase() === currencyCode)){
                    myAccount[config.name].balance[currencyCode] = parseFloat( funds[currencyCode]);
                    myAccount[config.name].available[currencyCode] = parseFloat( funds[currencyCode]);
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

let getPercentage = function (percentage, value, digits){
    return Math.floor(((percentage / 100) * value)*Math.pow(10,digits))/Math.pow(10, digits);
};

let getPercentageBuySpread = function(price, percentage, digits){
    const minus = Math.ceil(((percentage / 100) * price)*Math.pow(10,digits))/Math.pow(10, digits);
    return Math.round(((price-minus)*Math.pow(10,digits)))/Math.pow(10, digits);
};

let getPercentageValue = function (dividend, divisor, rounded, digits){
    let value = ((dividend / divisor) * 100)*Math.pow(10,digits);
    switch(rounded){
        case "floor":
            value = Math.floor(value);
            break;
        case "round":
            value = Math.round(value);
            break;
        case "ceil":
            value = Math.ceil(value);
            break;
    }
    return value/Math.pow(10, digits);
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

let getBuyOrderSize = function(pair, valueForSize, price){
    let size = 0;
    if(pair.moneyManagement.autopilot.active){
        size = setPrecisionDown((valueForSize/price), pair.digitsSize);
    } else if(pair.moneyManagement.supportLevel.active){
        if(pair.strategy.buySpread.percentage.active){
            //console.log("valueForSize: "+ valueForSize + " pair_id: " + pair.id);
            const supportLevelValue = pair.moneyManagement.supportLevel.value;
            const buySpreadPercentage = pair.strategy.buySpread.percentage.value;
            let counterPossibleOrders = 0;
            let nextBuyPriceLevel = price;
            while(nextBuyPriceLevel > supportLevelValue){
                counterPossibleOrders++;
                nextBuyPriceLevel = getPercentageBuySpread(nextBuyPriceLevel, buySpreadPercentage, pair.digitsPrice);
                //console.log(nextBuyPriceLevel);
            }
            //console.log("counterPossibleOrders: "+ counterPossibleOrders);
            valueForSize = valueForSize/counterPossibleOrders;
            //console.log("valueForSize: "+ valueForSize);
            size = setPrecisionDown((valueForSize/price), pair.digitsSize);
            //console.log("size: "+ size);
        } else {
            size = 0;
        }
    } else if(pair.moneyManagement.buyPercentageAvailableBalance.active){
        let fundValue =  getPercentage(pair.moneyManagement.buyPercentageAvailableBalance.value, valueForSize, pair.digitsPrice);
        if(pair.moneyManagement.buyPercentageAvailableBalance.maxAmount > 0 && fundValue > pair.moneyManagement.buyPercentageAvailableBalance.maxAmount){
            fundValue = pair.moneyManagement.buyPercentageAvailableBalance.maxAmount;
        }
        size = setPrecisionDown((fundValue/price), pair.digitsSize);
    } else if(pair.moneyManagement.buyPercentageAvailableBudget.active){
        let fundValue =  getPercentage(pair.moneyManagement.buyPercentageAvailableBudget.value, valueForSize, pair.digitsPrice);
        if(pair.moneyManagement.buyPercentageAvailableBudget.maxAmount > 0 && fundValue > pair.moneyManagement.buyPercentageAvailableBudget.maxAmount){
            fundValue = pair.moneyManagement.buyPercentageAvailableBudget.maxAmount;
        }
        size = setPrecisionDown((fundValue/price), pair.digitsSize);
    } else if(pair.moneyManagement.buyForAmount.active){
        size = setPrecisionDown((pair.moneyManagement.buyForAmount.value/price), pair.digitsSize);
    } else if (pair.moneyManagement.buySize.active){
        size = pair.moneyManagement.buySize.value;
    }
    //Fix size if minTradeAmount is lower than size what we want buy
    if(size < pair.minTradeAmount){
        size = pair.minTradeAmount;
    }
    //Fix size if (size*price) is lower is lower than minSpendAmount (we spend amount of myAccount.available[pair.name.split(pair.separator)[1]])
    if((size*price) < pair.minSpendAmount){
        size = setPrecisionUp((pair.minSpendAmount/price), pair.digitsSize);
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

let calculateProfit = function(exchange, completedOrder){
    //Buy part
    let buyFee = (completedOrder.buy_fee / completedOrder.buy_filled) * completedOrder.sell_filled;
    let buyTotalPrice = (completedOrder.sell_filled*completedOrder.buy_price);
    buyTotalPrice = setPrecisionUp(buyTotalPrice, 8);
    //Sell part
    let sellTotalPrice = (completedOrder.sell_filled*completedOrder.sell_price);
    sellTotalPrice = setPrecisionDown(sellTotalPrice, 8);
    //Fee part
    let totalFee = (buyFee)+(completedOrder.sell_fee);
    //Profit part
    let profit;
    if(totalFee<=0){
        //If was rebate for this trade, do not add it to profit. It will cause conflict with strategy sellOldestOrderWithLossWhenProfit
        profit = (sellTotalPrice - buyTotalPrice)
    } else {
        profit = (sellTotalPrice - buyTotalPrice)-(totalFee);
    }
    profit = setPrecisionDown(profit, 8);
    return profit;
};

let calculatePendingProfit = function(pendingOrder, sellPrice){
    let buyFee = ((pendingOrder.buy_fee / pendingOrder.buy_filled) * pendingOrder.sell_size);
    //If fee was with rebate, set buyFee 0 to get true pending profit
    let buyTotalPrice = (pendingOrder.sell_size*pendingOrder.buy_price);
    buyTotalPrice = setPrecisionUp(buyTotalPrice, 8);

    //Because we do not know sellFee, we use same as was buyFee
    let sellTotalPrice = (pendingOrder.sell_size*sellPrice);
    sellTotalPrice = setPrecisionDown(sellTotalPrice, 8);

    let profit;
    if(buyFee < 0){
        profit = sellTotalPrice - buyTotalPrice;
    } else {
        profit = (sellTotalPrice - buyTotalPrice)-(buyFee*2);
    }
    profit = setPrecisionDown(profit, 8);
    return profit;
};

let getAmountSpent = async function(db, exchange, pair){
    return new Promise(async function (resolve) {
        const po = await db.getAllSellOrders(exchange, pair.name, pair.id);
        let totalAmount = 0;
        for(let i=0;i<po.length;i++){
            if(po[i].buy_fee > 0 && exchange.name !== "binance"){
                totalAmount += (po[i].buy_price * po[i].sell_size)+po[i].buy_fee;
            } else {
                totalAmount += (po[i].buy_price * po[i].sell_size);
            }
        }
        resolve(totalAmount);
    });
};

let getTimeBetween = function(date1, date2){
    // Convert both dates in string to milliseconds
    let date1_ms = new Date(date1).getTime();
    let date2_ms = new Date(date2).getTime();

    // Calculate the difference in milliseconds
    let difference_ms = date2_ms - date1_ms;
    //take out milliseconds
    difference_ms = difference_ms/1000;
    let seconds = Math.floor(difference_ms % 60);
    difference_ms = difference_ms/60;
    let minutes = Math.floor(difference_ms % 60);
    difference_ms = difference_ms/60;
    let hours = Math.floor(difference_ms % 24);
    let days = Math.floor(difference_ms/24);
    return {days: days, hours: hours, minutes: minutes, seconds: seconds};
};

/*
const completedOrders = await db.getAllCompletedOrders();
console.log(completedOrders.length);
let totalProfit = 0;
let totalLossProfit = 0;
completedOrders.forEach(function(row) {
    const profit = tools.calculateProfit(row.exchange, row);
    //db.updateProfit(profit, row.sell_id);
    if(profit < 0 && row.exchange === "coinmate" && row.pair === "BTC_CZK"){
        totalLossProfit += profit;
    } else if(profit > 0 && row.exchange === "coinmate" && row.pair === "BTC_CZK") {
        totalProfit += profit;
    }
});
console.log(totalProfit);
console.log(totalLossProfit);
*/

module.exports = {
    parseBalance: parseBalance,
    addPipsToPrice: addPipsToPrice,
    takePipsFromPrice: takePipsFromPrice,
    getPercentage: getPercentage,
    getPercentageBuySpread: getPercentageBuySpread,
    getPercentageValue: getPercentageValue,
    getProfitTargetPrice: getProfitTargetPrice,
    getBuyOrderSize: getBuyOrderSize,
    convertPipsToPrice: convertPipsToPrice,
    setPrecision: setPrecision,
    setPrecisionUp: setPrecisionUp,
    setPrecisionDown: setPrecisionDown,
    sleep: sleep,
    orderDetailForm: orderDetailForm,
    orderCreatedForm: orderCreatedForm,
    calculateProfit: calculateProfit,
    calculatePendingProfit: calculatePendingProfit,
    getAmountSpent: getAmountSpent,
    getTimeBetween: getTimeBetween
};
