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
    //await tools.sleep(999999);
    if(doOrder === "ask"){
        // Parse all currency pair in config and check if is available balance for sell trade
        for(let i=0;i<config.exchanges.coinfalcon.pairs.length;i++){
            let pair = config.exchanges.coinfalcon.pairs[i];
            config.debug && console.log(new Date().toISOString()+" ### Lets process ask for "+ pair.name+" in the loop.");
            let sellingForCurrency = pair.name.split('-')[1];
            let sellingCurrency = pair.name.split('-')[0];

            //Fetch actual prices from coinfalcon exchange
            const resultCoinfalconTicker = await coinfalcon.getTicker(pair.name,2);
            apiCounterUsage++;
            //Parse fetched data to json object.
            tickersCoinfalcon[pair.name] = await coinfalcon.parseTicker(resultCoinfalconTicker, pair);
            //Get lowest pending sell order
            const pendingSellOrder = await db.getLowestFilledBuyOrder(config.exchanges.coinfalcon.name, pair.name);
            //console.log(pendingSellOrder);
            if(!pendingSellOrder){
                config.debug && console.log(new Date().toISOString()+" ### PendingSellOrder not found, skipp the loop.");
                //Nothing to sell, skip the loop.
                continue;
            }
            let targetAsk = await strategy.findSpotForAskOrder(pendingSellOrder, tickersCoinfalcon[pair.name] , pair);

            // Check for actual opened sell order
            const resultOpenedSellOrder = await db.getOpenedSellOrder(config.exchanges.coinfalcon.name, pair.name);
            let orderDetail;
            if(resultOpenedSellOrder){
                config.debug && console.log(new Date().toISOString()+" ### Found opened sell order " + resultOpenedSellOrder.sell_id);
                //If founded opened sell order, lets check and process
                orderDetail = await coinfalcon.getOrder(resultOpenedSellOrder.sell_id);
                await checkOrder(pair,"ask", targetAsk, resultOpenedSellOrder, orderDetail);
            }

            // Continue with open new trade
            if(targetAsk === 0){
                //skipping
            } else if(typeof resultOpenedSellOrder === 'undefined' && !resultOpenedSellOrder){
                config.debug && console.log(new Date().toISOString()+" !!! This will be first opened sell order!");
                if(tools.verifyDigits(pendingSellOrder.sell_target_price, pair.digitsPrice) <= targetAsk){
                    await processAskOrder(pair, targetAsk, pendingSellOrder);
                } else {
                    config.debug && console.error(new Date().toISOString() + " !!! No first sell order for this ask price!");
                }
            } else if(orderDetail.data.size_filled > 0){
                config.debug && console.log(new Date().toISOString()+" $$$ Filled ask order "+orderDetail.data.id+" processed!");
            } else if( targetAsk === resultOpenedSellOrder.sell_price){
                //Skipping because we already have opened bid order at this price
                config.debug && console.log(new Date().toISOString()+" ### We already have opened ask order at " + targetAsk);
            } else if (myAccount.coinfalcon.available[sellingCurrency] < pendingSellOrder.sell_size) {
                config.debug && console.error(new Date().toISOString() + " !!! No available " + sellingCurrency + " funds!");
            } else if (tools.verifyDigits(pendingSellOrder.sell_target_price) <= targetAsk) {
                await processAskOrder(pair, targetAsk, pendingSellOrder);
            } else {
                config.debug && console.error(new Date().toISOString() + " !!! No sell order for this ask price!");
                //console.log(pendingSellOrder);
            }
            config.debug && console.log(new Date().toISOString()+" ### Success finished "+pair.name+" ASK task, wait: "+(config.exchanges.coinfalcon.sleepPause * apiCounterUsage)+" ms");
            await tools.sleep(config.exchanges.coinfalcon.sleepPause * apiCounterUsage);
            apiCounterUsage = 0;
        }
        doOrder = "bid";
        return true;
    }

    if(doOrder === "bid"){
        // Parse all currency pair in config and check if is available balance for sell trade
        for(let i=0;i<config.exchanges.coinfalcon.pairs.length;i++){
            let pair = config.exchanges.coinfalcon.pairs[i];
            config.debug && console.log(new Date().toISOString()+" ### Lets process bid for "+ pair.name+" in the loop.");
            let buyForCurrency = pair.name.split('-')[1];
            let buyCurrency = pair.name.split('-')[0];

            //Fetch actual prices from coinfalcon exchange
            const resultCoinfalconTicker = await coinfalcon.getTicker(pair.name,2);
            apiCounterUsage++;
            //Parse fetched data to json object.
            tickersCoinfalcon[pair.name] = await coinfalcon.parseTicker(resultCoinfalconTicker, pair);
            //Get lowest already filled buy order = pending sell order
            const lowestFilledBuyOrder = await db.getLowestFilledBuyOrder(config.exchanges.coinfalcon.name, pair.name);
            // Check for actual oepend buy order
            const resultOpenedBuyOrder = await db.getOpenedBuyOrder(config.exchanges.coinfalcon.name, pair.name);
            //console.log(resultOpenedBuyOrder);
            let targetBid;
            if(lowestFilledBuyOrder){
                targetBid = await strategy.findSpotForBidOrder(false, true, lowestFilledBuyOrder, tickersCoinfalcon[pair.name] , pair);
            } else if(resultOpenedBuyOrder){
                targetBid = await strategy.findSpotForBidOrder(false, false, resultOpenedBuyOrder, tickersCoinfalcon[pair.name] , pair);
            } else {
                targetBid = await strategy.findSpotForBidOrder(true,  false, null, tickersCoinfalcon[pair.name] , pair);
            }

            let orderDetail;
            if(resultOpenedBuyOrder){
                config.debug && console.log(new Date().toISOString()+" ### Found opened bid order " + resultOpenedBuyOrder.buy_id);
                //If founded opened sell order, lets check and process
                orderDetail = await coinfalcon.getOrder(resultOpenedBuyOrder.buy_id);
                await checkOrder(pair,"bid", targetBid, resultOpenedBuyOrder, orderDetail);
            }
            //await console.log(lowestFilledBuyOrder);
            //await console.log(resultOpenedBuyOrder);
            // Continue with open new trade
            if(targetBid === 0){
                //Skipping because target was in danger zone
            } else if(typeof resultOpenedBuyOrder === 'undefined' && !resultOpenedBuyOrder ){
                config.debug && console.log(new Date().toISOString()+" !!! This will be first opened buy order!");
                await processBidOrder(pair, targetBid);
            } else if(orderDetail.data.size_filled > 0){
                config.debug && console.log(new Date().toISOString()+" $$$ Filled bid order "+orderDetail.data.id+" processed!");
            } else if( targetBid === resultOpenedBuyOrder.buy_price){
                //Skipping because we already have opened bid order at this price
                config.debug && console.log(new Date().toISOString()+" ### We already have opened bid order at " + targetBid);
            } else if (myAccount.coinfalcon.available[buyForCurrency] < Math.ceil((pair.buyForAmount/targetBid)*Math.pow(10, pair.digitsSize))/Math.pow(10, pair.digitsSize)){
                config.debug && console.error(new Date().toISOString()+" !!! No available "+buyForCurrency+" funds!");
            } else {
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

async function checkOrder(pair, type, targetPrice, resultOpenedOrder, orderDetail){
    switch(type){
        case "ask":
            //config.debug && console.log(orderDetail);
            if(orderDetail.data.size_filled > 0){
                switch(orderDetail.data.status) {
                    case "partially_filled":
                        config.debug && console.log(new Date().toISOString()+" ASK partially_filled");
                        //need cancel order on exchange
                        const resultCancelOrder = await coinfalcon.cancelOrder(resultOpenedOrder.sell_id);
                        apiCounterUsage++;
                        // After cancel order, add funds to available.
                        myAccount.coinfalcon.available[pair.name.split('-')[0]] += (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled));
                        if(parseFloat(orderDetail.data.fee) > 0){
                            myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                            myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                        }
                        await db.setCompletedSellOrder(resultCancelOrder.data.id, resultCancelOrder.data.status, resultCancelOrder.data.size_filled);
                        await db.reOpenPartFilledSellOrder(config.exchanges.coinfalcon.name, pair, resultOpenedOrder, (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled)));
                        break;
                    case "fulfilled":
                        config.debug && console.log(new Date().toISOString()+" ASK fulfilled");
                        // do not need close order on exchange, just update info to local db
                        if(parseFloat(orderDetail.data.fee) > 0){
                            myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                            myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                        }
                        await db.setCompletedSellOrder(orderDetail.data.id, orderDetail.data.status, orderDetail.data.size_filled);
                        break;
                    case "canceled":
                        if(parseFloat(orderDetail.data.size_filled) < parseFloat(orderDetail.data.size)){
                            config.debug && console.log(new Date().toISOString()+" ASK partially_filled from CANCELED");
                            //need cancel order on exchange
                            const resultCancelOrder = await coinfalcon.cancelOrder(resultOpenedOrder.sell_id);
                            apiCounterUsage++;
                            // After cancel order, add funds to available.
                            myAccount.coinfalcon.available[pair.name.split('-')[0]] += (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled));
                            if(parseFloat(orderDetail.data.fee) > 0){
                                myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                                myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                            }
                            await db.setCompletedSellOrder(resultCancelOrder.data.id, resultCancelOrder.data.status, resultCancelOrder.data.size_filled);
                            await db.reOpenPartFilledSellOrder(config.exchanges.coinfalcon.name, pair, resultOpenedOrder, (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled)));
                            break;
                        } else {
                            config.debug && console.log(new Date().toISOString()+" ASK fulfilled from CANCELED");
                            // do not need close order on exchange, just update info to local db
                            if(parseFloat(orderDetail.data.fee) > 0){
                                myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                                myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                            }
                            await db.setCompletedSellOrder(orderDetail.data.id, orderDetail.data.status, orderDetail.data.size_filled);
                            break;
                        }
                    default:
                        console.error("Something wrong with orderDetail.data");
                        await tools.sleep(999999);
                        break;
                }
            } else {
                if(targetPrice !== resultOpenedOrder.sell_price) {
                    switch (orderDetail.data.status) {
                        case "open":
                            config.debug && console.log(new Date().toISOString() + " ### We have new price, need close old sell order and delete db record");
                            const resultCancelOrder = await coinfalcon.cancelOrder(resultOpenedOrder.sell_id);
                            apiCounterUsage++;
                            // After cancel order, add funds to available.
                            myAccount.coinfalcon.available[pair.name.split('-')[0]] += parseFloat(resultCancelOrder.data.size);
                            if (resultCancelOrder.s) {
                                await db.deleteOpenedSellOrder(resultCancelOrder.data.id);
                            }
                            break;
                        case "canceled":
                            console.error("Database is unsynced!");
                            await tools.sleep(999999);
                            break;
                    }
                }
            }
            break;
        case "bid":
            //config.debug && console.log(orderDetail);
            if(orderDetail.data.size_filled > 0){
                const sell_target_price = tools.getProfitTargetPrice(parseFloat(orderDetail.data.price), pair.percentageProfitTarget, pair.digitsPrice);
                switch(orderDetail.data.status) {
                    case "partially_filled":
                        config.debug && console.log(new Date().toISOString()+" BID partially_filled");
                        //need cancel order on exchange
                        const resultCancelOrder = await coinfalcon.cancelOrder(resultOpenedOrder.buy_id);
                        apiCounterUsage++;
                        // After cancel order, add funds to available.
                        myAccount.coinfalcon.available[pair.name.split('-')[1]] += (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled));
                        if(parseFloat(resultCancelOrder.data.fee) > 0){
                            myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= parseFloat(orderDetail.data.fee);
                            myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(resultCancelOrder.data.fee);
                        }
                        await db.setPendingSellOrder(resultCancelOrder.data.id, orderDetail.data.status, resultCancelOrder.data.size_filled, sell_target_price);
                        break;
                    case "fulfilled":
                        config.debug && console.log(new Date().toISOString()+" BID fulfilled");
                        // do not need close order on exchange, just update info to local db
                        if(parseFloat(orderDetail.data.fee) > 0){
                            myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= parseFloat(orderDetail.data.fee);
                            myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(orderDetail.data.fee);
                        }
                        await db.setPendingSellOrder(orderDetail.data.id, orderDetail.data.status, orderDetail.data.size_filled, sell_target_price);
                        break;
                    case "canceled":
                        if(parseFloat(orderDetail.data.size_filled) < parseFloat(orderDetail.data.size)){
                            config.debug && console.log(new Date().toISOString()+" BID partially_filled CANCELED");
                            //need cancel order on exchange
                            const resultCancelOrder = await coinfalcon.cancelOrder(resultOpenedOrder.buy_id);
                            apiCounterUsage++;
                            // After cancel order, add funds to available.
                            myAccount.coinfalcon.available[pair.name.split('-')[1]] += (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled));
                            if(parseFloat(resultCancelOrder.data.fee) > 0){
                                myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= parseFloat(orderDetail.data.fee);
                                myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(resultCancelOrder.data.fee);
                            }
                            await db.setPendingSellOrder(resultCancelOrder.data.id, orderDetail.data.status, resultCancelOrder.data.size_filled, sell_target_price);
                            break;
                        } else {
                            config.debug && console.log(new Date().toISOString()+" BID fulfilled CANCELED");
                            // do not need close order on exchange, just update info to local db
                            if(parseFloat(orderDetail.data.fee) > 0){
                                myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= parseFloat(orderDetail.data.fee);
                                myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(orderDetail.data.fee);
                            }
                            await db.setPendingSellOrder(orderDetail.data.id, orderDetail.data.status, orderDetail.data.size_filled, sell_target_price);
                            break;
                        }
                    default:
                        console.error("Something wrong with orderDetail.data");
                        await tools.sleep(99999000);
                        break;
                }
            } else {
                if(targetPrice !== resultOpenedOrder.buy_price) {
                    switch (orderDetail.data.status) {
                        case "open":
                            config.debug && console.log(new Date().toISOString() + " ### We have new price, need close old buy order and delete db record");
                            const resultCancelOrder = await coinfalcon.cancelOrder(resultOpenedOrder.buy_id);
                            apiCounterUsage++;
                            myAccount.coinfalcon.available[pair.name.split('-')[1]] += parseFloat(resultCancelOrder.data.size);
                            config.debug && console.log(resultCancelOrder);
                            if (resultCancelOrder.s) {
                                await db.deleteOpenedBuyOrder(resultCancelOrder.data.id);
                            }
                            break;
                        case "canceled":
                            console.error("Database is unsynced!");
                            await tools.sleep(999999);
                            break;
                    }
                }
            }

            break;
    }
    return true;
}

async function processAskOrder(pair, targetAsk, pendingSellOrder){
        config.debug && console.log(new Date().toISOString()+" ### Let´go open new sell order!");
        const createdOrder = await coinfalcon.createOrder(pair, 'sell', pendingSellOrder, targetAsk);
        apiCounterUsage++;
        myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(createdOrder.data.size);
        await db.setOpenedSellerOrder(pair, pendingSellOrder, createdOrder);
    return true;
}

async function processBidOrder(pair, targetBid){
    config.debug && console.log(new Date().toISOString()+" ### Let´go open new buy order!");
    const createdOrder = await coinfalcon.createOrder(pair,'buy',null, targetBid);
    apiCounterUsage++;
    myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(createdOrder.data.size);
    await db.saveOpenedBuyOrder(config.exchanges.coinfalcon.name, pair, createdOrder);
    return true;
}