let config = require('../config');
let request = require('request');
let crypto = require('crypto');
var coinfalcon = require('../coinfalcon/api');
let db = require('../db/sqlite3');
const tools = require('../src/tools');
const strategy = require('../src/strategy');
// Multi threading
var cp = require('child_process');

// Start with ask order because need check for sold out orders
let doOrder = "ask";
let apiCounterUsage = 0;

let myAccount = {coinfalcon: {balance: {},available: {}}};
let tickersCoinfalcon = {};

// Async Init
(async function () {
    // Promise not compatible with config.debug && console.log, async is?
    await db.connect();
    startRetrieveRates();
})();

function startRetrieveRates() {
    let firstInit = true;
    // Worker for get rates in interval
    let proxyStatsWorker = cp.fork('workers/rates.js');
    // Send child process work
    proxyStatsWorker.send({});
    proxyStatsWorker.on('message', async function (result) {
        //console.log(result);
        if(result.balanceCoinfalcon){
            myAccount = await tools.parseBalance(result.balanceCoinfalcon, myAccount);
            if(firstInit){
                firstInit = false;
                begin();
            }
        }
    });
}

async function begin(){
    config.debug && console.log(new Date().toISOString()+" >>> Let´s call again start()");
    await start();
    config.debug && console.log(new Date().toISOString()+" $$$ start() finished, start again. ");
    await tools.sleep(2500);
    begin();
}

async function start() {
    if(doOrder === "ask"){
        // Parse all currency pair in config and check if is available balance for sell trade
        for(let i=0;i<config.exchanges.coinfalcon.pairs.length;i++){
            let pair = config.exchanges.coinfalcon.pairs[i];
            config.debug && console.log(new Date().toISOString()+" ### Lets process ask for "+ pair.name+" in the loop.");
            //let sellingForCurrency = pair.name.split('-')[1];
            //let sellingCurrency = pair.name.split('-')[0];

            //Get lowest pending sell order
            const pendingSellOrder = await db.getLowestFilledBuyOrder(config.exchanges.coinfalcon.name, pair.name);
            //console.log(pendingSellOrder);
            if(!pendingSellOrder){
                config.debug && console.log(new Date().toISOString()+" ### PendingSellOrder not found, skipp the loop.");
                //Nothing to sell, skip the loop.
                continue;
            }
            // Check for actual opened sell order
            const resultOpenedSellOrder = await db.getOpenedSellOrder(config.exchanges.coinfalcon.name, pair.name);
            //Fetch actual prices from coinfalcon exchange
            const resultCoinfalconTicker = await coinfalcon.getTicker(pair.name,2);
            apiCounterUsage++;
            //Parse fetched data to json object.
            tickersCoinfalcon[pair.name] = await coinfalcon.parseTicker("ask", resultCoinfalconTicker, pair, resultOpenedSellOrder);

            let targetAsk = await strategy.findSpotForAskOrder(pendingSellOrder, tickersCoinfalcon[pair.name] , pair);

            if(typeof resultOpenedSellOrder !== 'undefined' && resultOpenedSellOrder){
                config.debug && console.log(new Date().toISOString()+" ### Found opened sell order " + resultOpenedSellOrder.sell_id);
                if(targetAsk !== tools.setPrecision(resultOpenedSellOrder.sell_price, pair.digitsPrice)){
                    //If founded opened sell order, lets check and process
                    const canOpenAskOrder = await validateOrder(resultOpenedSellOrder.sell_id, pair, resultOpenedSellOrder);
                    // Only if canceled order was not partially_filled or fulfilled can open new order. Need get actual feed.
                    if(canOpenAskOrder){
                        await processAskOrder(pair, targetAsk, pendingSellOrder);
                    }
                } else {
                    config.debug && console.log(new Date().toISOString()+" ### We already have opened ask order at " + targetAsk + " skipping validateOrder");
                }
            } else {
                config.debug && console.log(new Date().toISOString()+" !!! This will be first opened sell order!");
                await processAskOrder(pair, targetAsk, pendingSellOrder);
            }

            config.debug && console.log(new Date().toISOString()+" ### Success finished "+pair.name+" ASK task, wait: "+(config.exchanges.coinfalcon.sleepPause * apiCounterUsage)+" ms");
            await tools.sleep(config.exchanges.coinfalcon.sleepPause * apiCounterUsage);
            apiCounterUsage = 0;
        }
        doOrder = "bid";
        return true;
    }else if(doOrder === "bid"){
        // Parse all currency pair in config and check if is available balance for sell trade
        for(let i=0;i<config.exchanges.coinfalcon.pairs.length;i++){
            let pair = config.exchanges.coinfalcon.pairs[i];
            config.debug && console.log(new Date().toISOString()+" ### Lets process bid for "+ pair.name+" in the loop.");
            //let buyForCurrency = pair.name.split('-')[1];
            //let buyCurrency = pair.name.split('-')[0];

            //Get lowest already filled buy order = pending sell order
            const lowestFilledBuyOrder = await db.getLowestFilledBuyOrder(config.exchanges.coinfalcon.name, pair.name);
            // Check for actual oepend buy order
            const resultOpenedBuyOrder = await db.getOpenedBuyOrder(config.exchanges.coinfalcon.name, pair.name);
            //console.log(resultOpenedBuyOrder);
            //Fetch actual prices from coinfalcon exchange
            const resultCoinfalconTicker = await coinfalcon.getTicker(pair.name,2);
            apiCounterUsage++;
            //Parse fetched data to json object.
            tickersCoinfalcon[pair.name] = await coinfalcon.parseTicker("bid", resultCoinfalconTicker, pair, resultOpenedBuyOrder);
            let targetBid;
            if(lowestFilledBuyOrder){
                targetBid = await strategy.findSpotForBidOrder(false, true, lowestFilledBuyOrder, tickersCoinfalcon[pair.name] , pair);
            } else if(resultOpenedBuyOrder){
                targetBid = await strategy.findSpotForBidOrder(false, false, resultOpenedBuyOrder, tickersCoinfalcon[pair.name] , pair);
            } else {
                targetBid = await strategy.findSpotForBidOrder(true,  false, null, tickersCoinfalcon[pair.name] , pair);
            }

            if(typeof resultOpenedBuyOrder !== 'undefined' && resultOpenedBuyOrder){
                config.debug && console.log(new Date().toISOString()+" ### Found opened bid order " + resultOpenedBuyOrder.buy_id);
                if(targetBid !== tools.setPrecision(resultOpenedBuyOrder.buy_price, pair.digitsPrice)) {
                    //If founded opened buy order, lets check and process
                    const canOpenBidOrder = await validateOrder(resultOpenedBuyOrder.buy_id, pair, resultOpenedBuyOrder);
                    // Only if canceled order was not partially_filled or fulfilled can open new order. Need get actual feed.
                    if(canOpenBidOrder){
                        await processBidOrder(pair, targetBid);
                    }
                } else {
                    config.debug && console.log(new Date().toISOString()+" ### We already have opened bid order at " + targetBid + " skipping validateOrder");
                }
            } else {
                config.debug && console.log(new Date().toISOString()+" !!! This will be first opened buy order!");
                await processBidOrder(pair, targetBid);
            }

            config.debug && console.log(new Date().toISOString()+" ### Success finished "+pair.name+" BID task, wait: "+(config.exchanges.coinfalcon.sleepPause * apiCounterUsage)+" ms");
            await tools.sleep(config.exchanges.coinfalcon.sleepPause * apiCounterUsage);
            apiCounterUsage = 0;
        }
        doOrder = "ask";
        return true;
    }
}

async function validateOrder(id, pair, openedOrder){
    let orderDetail;
    //Before validate order, first we need cancel opened order to avoid changes in data while validating.
    const canceledOrder = await coinfalcon.cancelOrder(id);
    apiCounterUsage++;
    if (canceledOrder.s){
        config.debug && console.log(new Date().toISOString() + " ### orderDetail = coinfalcon.cancelOrder(id)");
        orderDetail = canceledOrder.data;
    } else {
        //Order was probably canceled manually, sync local DB
        const detailOrder = await coinfalcon.getOrder(id);
        if(detailOrder.s){
            config.debug && console.log(new Date().toISOString() + " ### orderDetail = coinfalcon.getOrder(id)");
            orderDetail = detailOrder.data;
        } else {
            console.error("Something bad happened when validate canceled order "+id+" !");
        }
    }
    //Check if order was partially_filled or fulfilled.
    if(parseFloat(orderDetail.size_filled) === 0){
        // Order was not filled
        switch(orderDetail.order_type){
            case "buy":
                config.debug && console.log(new Date().toISOString() + " ### We have new price, old buy order was canceled");
                myAccount.coinfalcon.available[pair.name.split('-')[1]] += parseFloat(orderDetail.funds);
                config.debug && console.log(orderDetail);
                await db.deleteOpenedBuyOrder(orderDetail.id);
                break;
            case "sell":
                config.debug && console.log(new Date().toISOString() + " ### We have new price, old sell order was canceled");
                myAccount.coinfalcon.available[pair.name.split('-')[0]] += parseFloat(orderDetail.size);
                await db.deleteOpenedSellOrder(orderDetail.id);
                break;
        }
        return true;
    } else if(parseFloat(orderDetail.size_filled) === parseFloat(orderDetail.size)){
        // Order was fulfilled
        switch(orderDetail.order_type){
            case "buy":
                await db.deleteOpenedBuyOrder(orderDetail.id);
                break;
            case "sell":
                await db.setCompletedSellOrder(orderDetail);
                break;
        }
        myAccount = await strategy.processFulfilledOrder(myAccount, pair, orderDetail);
        return false;
    } else if(parseFloat(orderDetail.size_filled) < parseFloat(orderDetail.size)){
        // Order was partially_filled
        switch(orderDetail.order_type){
            case "buy":
                const sell_target_price = tools.getProfitTargetPrice(parseFloat(orderDetail.price), pair.percentageProfitTarget, pair.digitsPrice);
                await db.setPendingSellOrder(orderDetail, sell_target_price);
                break;
            case "sell":
                await db.setCompletedSellOrder(orderDetail);
                await db.reOpenPartFilledSellOrder(config.exchanges.coinfalcon.name, pair, openedOrder, (parseFloat(orderDetail.size)-parseFloat(orderDetail.size_filled)));
                break;
        }
        myAccount = await strategy.processPartiallyFilled(myAccount, pair, orderDetail);
        return false;
    } else {
        console.error("Something bad happened when validateOrder "+orderDetail.id+" !");
    }
}

async function processAskOrder(pair, targetAsk, pendingSellOrder){
    if(targetAsk === 0){
        config.debug && console.error(new Date().toISOString()+" !!! Skipping process ask order because targetAsk === 0!");
        return false;
    } else if (myAccount.coinfalcon.available[pair.name.split('-')[0]] < tools.setPrecision(pendingSellOrder.sell_size, pair.digitsSize)) {
        config.debug && console.error(new Date().toISOString() + " !!! No available " + pair.name.split('-')[0] + " funds!");
        return false;
    } else if (tools.setPrecision(pendingSellOrder.sell_target_price, pair.digitsPrice) <= targetAsk) {
        config.debug && console.log(new Date().toISOString()+" ### Let´go open new sell order!");
        const createdOrder = await coinfalcon.createOrder(pair, 'sell', pendingSellOrder, targetAsk);
        apiCounterUsage++;
        myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(createdOrder.data.size);
        await db.setOpenedSellerOrder(pair, pendingSellOrder, createdOrder);
        return true;
    } else {
        config.debug && console.log(new Date().toISOString() + " !!! No sell order for this ask price!");
        return false;
    }
}

async function processBidOrder(pair, targetBid){
    if(targetBid === 0){
        config.debug && console.error(new Date().toISOString()+" !!! Skipping process bid order because targetBid === 0!");
        return false;
    } else if (myAccount.coinfalcon.available[pair.name.split('-')[1]] < tools.setPrecisionUp((pair.buyForAmount/targetBid), pair.digitsPrice)){
        config.debug && console.error(new Date().toISOString()+" !!! No available "+pair.name.split('-')[1]+" funds!");
        return false;
    } else {
        config.debug && console.log(new Date().toISOString()+" ### Let´go open new buy order!");
        const createdOrder = await coinfalcon.createOrder(pair,'buy',null, targetBid);
        apiCounterUsage++;
        myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(createdOrder.data.size);
        await db.saveOpenedBuyOrder(config.exchanges.coinfalcon.name, pair, createdOrder);
        return true;
    }
}