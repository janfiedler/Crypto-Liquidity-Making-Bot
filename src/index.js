let config = require('../config');
let request = require('request');
let crypto = require('crypto');
var coinfalcon = require('../coinfalcon');
let db = require('../db/sqlite3');
const tools = require('../src/tools');
// Multi threading
var cp = require('child_process');

// Start with ask order
let doOrder = "ask";
let apiCounterUsage = 0;


let myAccount = {coinfalcon: {balance: {},available: {},buyData: {}, sellData:{}}};
let tickersCoinfalcon = {};
let tickersBitfinex = {};

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
        if(result.bitfinexTickers.s && result.coinfalconBalance){
            myAccount = await tools.parseBalance(result.coinfalconBalance, myAccount);
            tickersBitfinex = result.bitfinexTickers.data;
            config.debug && console.log(tickersBitfinex);
            if(firstInit){
                firstInit = false;
                begin();
            }
        }
    });
}

async function begin(){
    config.debug && console.log(new Date().toISOString()+" >>> Let´s call again start()");
    const startResult = await start();
    config.debug && console.log(new Date().toISOString()+ " === startResult: " + startResult);
    config.debug && console.log(new Date().toISOString()+" $$$ start() finished, start again. ");
    //await tools.sleep(3000);
    begin();
}

async function start() {

    if(doOrder === "ask"){
        // Parse all currency pair in config and check if is available balance for sell trade
        for(let i=0;i<config.exchanges.coinfalcon.pairs.length;i++){
            let pair = config.exchanges.coinfalcon.pairs[i];
            let sellingForCurrency = pair.name.split('-')[1];
            let sellingCurrency = pair.name.split('-')[0];
            if(myAccount.coinfalcon.available[sellingCurrency] > 0){
                let processAsk = async function() {
                    config.debug && console.log("lets sell " + sellingCurrency + " for " + sellingForCurrency);

                    config.debug && console.log(new Date().toISOString()+" fetch actual prices "+pair.name+" on coinfalcon exchange");
                    const resultCoinfalconTicker = await coinfalcon.getTicker(pair.name,2);
                    apiCounterUsage++;
                    tickersCoinfalcon[pair.name] = await coinfalcon.parseCoinfalconTicker(resultCoinfalconTicker, pair);

                    //Fetch data from database
                    const resultOpenedSellOrder = await db.getOpenedSellOrder(pair.name);

                    myAccount.coinfalcon.sellData[pair.name] = { id: '',
                        price: 0,
                        target_price: 0,
                        size: 0,
                        size_filled: 0,
                        fee: 0,
                        funds: 0,
                        created_at: '' };
                    myAccount.coinfalcon.buyData[pair.name] = { id: '',
                        status: '',
                        price: 0,
                        size: 0,
                        size_filled: 0,
                        fee: 0,
                        funds: 0,
                        created_at: '' };

                    if(resultOpenedSellOrder){
                        //config.debug && console.log(resultOpenedSellOrder);
                        myAccount.coinfalcon.sellData[pair.name].id = resultOpenedSellOrder.sell_id;
                        myAccount.coinfalcon.sellData[pair.name].price = resultOpenedSellOrder.sell_price;
                        myAccount.coinfalcon.sellData[pair.name].target_price = resultOpenedSellOrder.sell_target_price;
                        myAccount.coinfalcon.sellData[pair.name].size = resultOpenedSellOrder.sell_size;
                        myAccount.coinfalcon.buyData[pair.name].id = resultOpenedSellOrder.buy_id;
                        myAccount.coinfalcon.buyData[pair.name].status = resultOpenedSellOrder.buy_status;
                        myAccount.coinfalcon.buyData[pair.name].price = resultOpenedSellOrder.buy_price;
                        myAccount.coinfalcon.buyData[pair.name].size = resultOpenedSellOrder.buy_size;
                        myAccount.coinfalcon.buyData[pair.name].size_filled = resultOpenedSellOrder.buy_filled;
                        myAccount.coinfalcon.buyData[pair.name].funds = resultOpenedSellOrder.buy_funds;
                        myAccount.coinfalcon.buyData[pair.name].created_at = resultOpenedSellOrder.buy_created;
                    }

                    //find open price for ask order
                    let targetAsk = await findSpotForAsk(pair);

                    if(myAccount.coinfalcon.sellData[pair.name].id !== ""){
                        const canceled = await checkOrder(pair, "ask", targetAsk);
                        if(canceled){
                            config.debug && console.log(new Date().toISOString()+" My ask order was canceled");
                            await processAsk();
                        }
                    } else {
                        //process ask order
                        // Need found if we have some pending sell order with targetAsk >= sell_target_price
                        const pendingSellOrder = await db.getPendingSellOrder(pair.name, targetAsk);
                        if(pendingSellOrder){
                            //config.debug && console.log(pendingSellOrder);
                            myAccount.coinfalcon.sellData[pair.name].size = pendingSellOrder.sell_size;
                            myAccount.coinfalcon.buyData[pair.name].id = pendingSellOrder.buy_id;
                            await processAskOrder(pair, targetAsk);
                        } else {
                            config.debug && console.log(new Date().toISOString()+" !!! No sell order for this ask price!");
                        }
                    }
                };
                await processAsk();
            } else {
                config.debug && console.log("No funds for sell order " + sellingCurrency);
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
            let buyForCurrency = pair.name.split('-')[1];
            let buyCurrency = pair.name.split('-')[0];
            if(myAccount.coinfalcon.available[buyForCurrency] > 0){
                let processBid = async function() {
                    config.debug && console.log("lets buy " + buyCurrency + " for " + buyForCurrency);
                    config.debug && console.log(new Date().toISOString()+" fetch actual prices "+pair.name+" on coinfalcon exchange");
                    const resultCoinfalconTicker = await coinfalcon.getTicker(pair.name,2);
                    apiCounterUsage++;
                    tickersCoinfalcon[pair.name] = await coinfalcon.parseCoinfalconTicker(resultCoinfalconTicker, pair);
                    //config.debug && console.log(tickersCoinfalcon);

                    //Fetch data from database
                    const resultOpenedBuyOrder = await db.getOpenedBuyOrder(pair.name);
                    myAccount.coinfalcon.buyData[pair.name] = { id: '',
                        price: 0,
                        size: 0,
                        size_filled: 0,
                        fee: 0,
                        funds: 0,
                        created_at: '' };

                    if(resultOpenedBuyOrder){
                        //config.debug && console.log(resultOpenedBuyOrder);
                        myAccount.coinfalcon.buyData[pair.name].id = resultOpenedBuyOrder.buy_id;
                        myAccount.coinfalcon.buyData[pair.name].price = resultOpenedBuyOrder.buy_price;
                    }

                    const targetBid = await findSpotForBid(pair);
                    //config.debug && console.log(targetBid);
                    //config.debug && console.log(myAccount);

                    if(myAccount.coinfalcon.buyData[pair.name].id !== ""){
                        let canceled = await checkOrder(pair, "bid", targetBid);
                        if(canceled){
                            config.debug && console.log(new Date().toISOString()+" My bid order was canceled");
                            await processBid();
                        }
                    } else {
                        //process bid order
                        await processBidOrder(pair, targetBid);
                    }
                };
                await processBid();
            } else {
                config.debug && console.log("No funds for buy order " + buyCurrency);
            }
            config.debug && console.log(new Date().toISOString()+" ### Success finished "+pair.name+" BID task, wait: "+(config.exchanges.coinfalcon.sleepPause * apiCounterUsage)+" ms");
            await tools.sleep(config.exchanges.coinfalcon.sleepPause * apiCounterUsage);
            apiCounterUsage = 0;
        }
        doOrder = "ask";
        return true;
    }
}

async function checkOrder(pair, type, newPrice){
    let canceled = false;
    switch(type){
        case "ask":
            if(newPrice !== myAccount.coinfalcon.sellData[pair.name].price && myAccount.coinfalcon.sellData[pair.name].id !== ""){
                //Let´s check order state
                const orderDetail = await coinfalcon.getOrder(myAccount.coinfalcon.sellData[pair.name].id);
                apiCounterUsage++;
                //config.debug && console.log(orderDetail);
                if(orderDetail.data.size_filled > 0){
                    switch(orderDetail.data.status) {
                        case "partially_filled":
                            config.debug && console.log(new Date().toISOString()+" ASK partially_filled");
                            //need cancel order on exchange
                            const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.sellData[pair.name].id);
                            apiCounterUsage++;
                            // After cancel order, add funds to available.
                            myAccount.coinfalcon.available[pair.name.split('-')[0]] += (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled));
                            if(parseFloat(orderDetail.data.fee) > 0){
                                myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                                myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                            }
                            await db.setCompletedSellOrder(resultCancelOrder.data.id, resultCancelOrder.data.status, resultCancelOrder.data.size_filled);
                            await db.reOpenPartFilledSellOrder(pair, myAccount, (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled)));
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
                                const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.sellData[pair.name].id);
                                apiCounterUsage++;
                                // After cancel order, add funds to available.
                                myAccount.coinfalcon.available[pair.name.split('-')[0]] += (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled));
                                if(parseFloat(orderDetail.data.fee) > 0){
                                    myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                                    myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                                }
                                await db.setCompletedSellOrder(resultCancelOrder.data.id, resultCancelOrder.data.status, resultCancelOrder.data.size_filled);
                                await db.reOpenPartFilledSellOrder(pair, myAccount, (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled)));
                                break;
                            } else {
                                config.debug && console.log(new Date().toISOString()+" ASK fulfilled from CANCEL");
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
                    switch(orderDetail.data.status) {
                        case "open":
                            config.debug && console.log(new Date().toISOString()+" We have new price, need close old sell order and delete db record");
                            const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.sellData[pair.name].id);
                            apiCounterUsage++;
                            // After cancel order, add funds to available.
                            myAccount.coinfalcon.available[pair.name.split('-')[0]] += parseFloat(resultCancelOrder.data.size);
                            config.debug && console.log(resultCancelOrder);
                            myAccount.coinfalcon.sellData[pair.name] = {};
                            if(resultCancelOrder.s){
                                await db.deleteOpenedSellOrder(resultCancelOrder.data.id);
                                canceled = true;
                            } else {
                                canceled = false;
                            }
                            break;
                        case "canceled":
                            console.error("Database is unsynced!");
                            await tools.sleep(999999);
                            break;
                    }
                }
            } else if(newPrice === myAccount.coinfalcon.sellData[pair.name].price){
                config.debug && console.log(new Date().toISOString()+" ### We already have opened ask order at " + newPrice);
            }
            break;
        case "bid":
            if(newPrice !== myAccount.coinfalcon.buyData[pair.name].price && myAccount.coinfalcon.buyData[pair.name].id !== ""){
                //Let´s check order state
                const orderDetail = await coinfalcon.getOrder(myAccount.coinfalcon.buyData[pair.name].id);
                apiCounterUsage++;
                //config.debug && console.log(orderDetail);
                if(orderDetail.data.size_filled > 0){
                    const sell_target_price = tools.getProfitTargetPrice(parseFloat(orderDetail.data.price), pair.percentageProfitTarget, pair.digitsPrice);
                    switch(orderDetail.data.status) {
                        case "partially_filled":
                            config.debug && console.log(new Date().toISOString()+" BID partially_filled");
                            //need cancel order on exchange
                            const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.buyData[pair.name].id);
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
                                const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.buyData[pair.name].id);
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
                    switch(orderDetail.data.status) {
                        case "open":
                            config.debug && console.log(new Date().toISOString()+" We have new price, need close old buy order and delete db record");
                            const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.buyData[pair.name].id);
                            apiCounterUsage++;
                            myAccount.coinfalcon.available[pair.name.split('-')[1]] += parseFloat(resultCancelOrder.data.size);
                            config.debug && console.log(resultCancelOrder);
                            myAccount.coinfalcon.buyData[pair.name] = {};
                            if(resultCancelOrder.s){
                                await db.deleteOpenedBuyOrder(resultCancelOrder.data.id);
                                canceled = true;
                            } else {
                                canceled = false;
                            }
                            break;
                        case "canceled":
                            console.error("Database is unsynced!");
                            await tools.sleep(999999);
                            break;
                    }
                }
            } else if(newPrice === myAccount.coinfalcon.buyData[pair.name].price){
                config.debug && console.log(new Date().toISOString()+" ### We already have opened bid order at " + newPrice);
            }
            break;
    }
    return canceled;
}

async function findSpotForAsk(pair){
    let targetAsk = tickersCoinfalcon[pair.name].ask;
    if(myAccount.coinfalcon.sellData[pair.name].price > 0){
        config.debug && console.log(new Date().toISOString()+" ### targetAsk = myAccount.coinfalcon.sellData[pair.name].price");
        targetAsk = myAccount.coinfalcon.sellData[pair.name].price;
    }
    config.debug && console.log(new Date().toISOString()+" targetAsk start: " + targetAsk);
    config.debug && console.log(new Date().toISOString()+" Bitfinex ask: " + tickersBitfinex[pair.name].ask);
    config.debug && console.log(new Date().toISOString()+" Coinfalcon ask: " + tickersCoinfalcon[pair.name].ask);
    config.debug && console.log(new Date().toISOString()+" Coinfalcon bid: " + tickersCoinfalcon[pair.name].bid);

    const askTakeOnePip = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].ask, 1, pair.digitsPrice);
    const askSecondTakeOnePip = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].askSecond, 1, pair.digitsPrice);
    const ask3thTakeOnePip = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].ask3th, 1, pair.digitsPrice);

    if(tickersCoinfalcon[pair.name].ask === myAccount.coinfalcon.sellData[pair.name].price){
        config.debug && console.log(new Date().toISOString()+" ### Already opened order for that ticksCoinfalcon.ask");
        // If target ask is lower than secondsAsk price and  askSizeWithoutMyOrder is <= pair.ignoreOrderSize than move close to secondAsk price.
        if(targetAsk < tickersCoinfalcon[pair.name].askSecond && tickersCoinfalcon[pair.name].askSecondSize > tickersCoinfalcon[pair.name].askSize && tickersCoinfalcon[pair.name].askSecondSize >= pair.ignoreOrderSize){
            config.debug && console.log(new Date().toISOString()+" ### To far away from ticksCoinfalcon.askSecond, take pip from askSecond");
            targetAsk = askSecondTakeOnePip;
        } else if (targetAsk > tickersCoinfalcon[pair.name].askSecond && targetAsk < tickersCoinfalcon[pair.name].ask3th && tickersCoinfalcon[pair.name].ask3thSize > tickersCoinfalcon[pair.name].askSecondSize && tickersCoinfalcon[pair.name].ask3thSize >= pair.ignoreOrderSize){
            config.debug && console.log(new Date().toISOString()+" ### To far away from ticksCoinfalcon.askSecond, take pip from ask3th");
            targetAsk = ask3thTakeOnePip;
        }
    } else if(tickersCoinfalcon[pair.name].askSecond === myAccount.coinfalcon.sellData[pair.name].price){
        if(tickersCoinfalcon[pair.name].ask < targetAsk && tickersCoinfalcon[pair.name].askSize > tickersCoinfalcon[pair.name].askSecondSize && tickersCoinfalcon[pair.name].askSize >= pair.ignoreOrderSize){
            config.debug && console.log(new Date().toISOString()+" ### Move back to front line at first ask order");
            targetAsk = askTakeOnePip;
        } else if (targetAsk > tickersCoinfalcon[pair.name].askSecond && targetAsk < tickersCoinfalcon[pair.name].ask3th && tickersCoinfalcon[pair.name].ask3thSize > tickersCoinfalcon[pair.name].askSecondSize && tickersCoinfalcon[pair.name].ask3thSize >= pair.ignoreOrderSize){
            config.debug && console.log(new Date().toISOString()+" ### To far away from ticksCoinfalcon.askSecond, take pip from ask3th");
            targetAsk = ask3thTakeOnePip;
        }
    } else if(targetAsk > tickersCoinfalcon[pair.name].ask3th){
        config.debug && console.log(new Date().toISOString()+" ### targetAsk > tickersCoinfalcon[pair.name].ask3th - move back to ask3th");
        targetAsk = ask3thTakeOnePip;
    } else if(myAccount.coinfalcon.sellData[pair.name].price === 0 && tickersCoinfalcon[pair.name].askSize > tickersCoinfalcon[pair.name].askSecondSize && tickersCoinfalcon[pair.name].askSize >= pair.ignoreOrderSize){
        targetAsk = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].ask, 1, pair.digitsPrice);
        config.debug && console.log(new Date().toISOString()+" ### targetAsk => sell cheaper than first order, take pip if order size is not ignored.");
    } else if(myAccount.coinfalcon.sellData[pair.name].price === 0 && tickersCoinfalcon[pair.name].askSecondSize > tickersCoinfalcon[pair.name].ask3thSize && tickersCoinfalcon[pair.name].askSecondSize >= pair.ignoreOrderSize){
        config.debug && console.log(new Date().toISOString()+" ### targetAsk => sell cheaper than 2th order, take pip if order size is not ignored.");
        targetAsk = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].askSecond, 1, pair.digitsPrice);
    } else if(myAccount.coinfalcon.sellData[pair.name].price === 0 && tickersCoinfalcon[pair.name].ask3thSize >= pair.ignoreOrderSize){
        config.debug && console.log(new Date().toISOString()+" ### targetAsk => sell cheaper than 3th order, take pip if order size is not ignored.");
        targetAsk = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].ask3th, 1, pair.digitsPrice);
    } else if(pair.followBitfinexPrice){
        config.debug && console.log(new Date().toISOString()+" ### tickersCoinfalcon[pair.name].ask "+tickersCoinfalcon[pair.name].ask+" < tickersBitfinex[pair.name].ask "+tickersBitfinex[pair.name].ask+" set buy order to Bitfinex.ask");
        targetAsk = tickersBitfinex[pair.name].ask;
    } else {
        //If you have followBitfinexPrice true, you are protected from selling cheaper than is price of pair on bitfinex.
        if(pair.followBitfinexPrice){
            config.debug && console.log(new Date().toISOString()+" ### Replacing our sell order to higher price following bitfinex price");
            targetAsk = tickersBitfinex[pair.name].ask;
        } else {
            console.error("Missing strategy");
        }
    }

    //Validate if new target ask is not close to bid order or taking bid order.
    let bidBorderSpreadPips = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bidBorder, pair.pipsSpread, pair.digitsPrice);
    if(targetAsk < bidBorderSpreadPips) {
        config.debug && console.log(new Date().toISOString()+ "### New target ask "+targetAsk+" is in danger zone bid border "+tickersCoinfalcon[pair.name].bidBorder+", need go higher with price");
        targetAsk = bidBorderSpreadPips;
    }
    config.debug && console.log(new Date().toISOString()+" targetAsk: " + targetAsk);
    return targetAsk;
}

async function findSpotForBid(pair){
    let targetBid = tickersCoinfalcon[pair.name].bid;
    if(myAccount.coinfalcon.buyData[pair.name].price > 0){
        config.debug && console.log(new Date().toISOString()+" ### targetBid = myAccount.coinfalcon.buyData[pair.name].price");
        targetBid = myAccount.coinfalcon.buyData[pair.name].price;
    }
    config.debug && console.log(new Date().toISOString()+" targetBid start: " + targetBid);
    config.debug && console.log(new Date().toISOString()+" Bitfinex bid "+pair.name+": " + tickersBitfinex[pair.name].bid);
    config.debug && console.log(new Date().toISOString()+" Coinfalcon ask "+pair.name+": " + tickersCoinfalcon[pair.name].ask);
    config.debug && console.log(new Date().toISOString()+" Coinfalcon bid "+pair.name+": " + tickersCoinfalcon[pair.name].bid);

    const bidPlusOnePip = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bid, 1, pair.digitsPrice);
    const bidSecondPlusOnePip = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bidSecond, 1, pair.digitsPrice);
    const bid3thPlusOnePip = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bid3th, 1, pair.digitsPrice);

    if(tickersCoinfalcon[pair.name].bid === myAccount.coinfalcon.buyData[pair.name].price){
        config.debug && console.log(new Date().toISOString()+" ### already opened order for that ticksCoinfalcon.bid");

        if(targetBid > tickersCoinfalcon[pair.name].bidSecond && tickersCoinfalcon[pair.name].bidSecondSize > tickersCoinfalcon[pair.name].bidSize && tickersCoinfalcon[pair.name].bidSecondSize >= pair.ignoreOrderSize){
            config.debug && console.log(new Date().toISOString()+" ### To far away from ticksCoinfalcon.bidSecond, add pip to bidSecond");
            targetBid = bidSecondPlusOnePip;
        } else if (targetBid > tickersCoinfalcon[pair.name].bidSecond && targetBid < tickersCoinfalcon[pair.name].bid3th && tickersCoinfalcon[pair.name].bid3thSize > tickersCoinfalcon[pair.name].bidSecondSize && tickersCoinfalcon[pair.name].bid3thSize >= pair.ignoreOrderSize){
            config.debug && console.log(new Date().toISOString()+" ### To far away from ticksCoinfalcon.bid3th, add pip to bid3th");
            targetBid = bid3thPlusOnePip;
        }
    } else if(tickersCoinfalcon[pair.name].bidSecond === myAccount.coinfalcon.buyData[pair.name].price) {
        config.debug && console.log(new Date().toISOString()+" ### already opened order for at ticksCoinfalcon.bidSecond");
        if(tickersCoinfalcon[pair.name].bid > targetBid && tickersCoinfalcon[pair.name].bidSize > tickersCoinfalcon[pair.name].bidSecondSize && tickersCoinfalcon[pair.name].bidSize >= pair.ignoreOrderSize){
            config.debug && console.log(new Date().toISOString()+" ### Move back to front line at first buy order");
            targetBid = bidPlusOnePip;
        } else if(targetBid < tickersCoinfalcon[pair.name].bidSecond && targetBid > tickersCoinfalcon[pair.name].bid3th && tickersCoinfalcon[pair.name].bid3thSize > tickersCoinfalcon[pair.name].bidSecondSize && tickersCoinfalcon[pair.name].bid3thSize >= pair.ignoreOrderSize){
            config.debug && console.log(new Date().toISOString()+" ### To far away from ticksCoinfalcon.bid3th, add pip to bid3th");
            targetBid = bid3thPlusOnePip;
        }
    } else if(targetBid < tickersCoinfalcon[pair.name].bid3th){
        config.debug && console.log(new Date().toISOString()+" ### targetBid < tickersCoinfalcon[pair.name].bid3th - move back to bid3th order");
        targetBid = bid3thPlusOnePip;
    } else if(myAccount.coinfalcon.buyData[pair.name].price === 0 && tickersCoinfalcon[pair.name].bidSize > tickersCoinfalcon[pair.name].bidSecondSize &&  tickersCoinfalcon[pair.name].bidSize >= pair.ignoreOrderSize){
        targetBid = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bid, 1, pair.digitsPrice);
        config.debug && console.log(new Date().toISOString()+" ### targetBid => offer higher price than 1th order, add pip if order size is not ignored.");
    } else if(myAccount.coinfalcon.buyData[pair.name].price === 0 && tickersCoinfalcon[pair.name].bidSecondSize > tickersCoinfalcon[pair.name].bid3thSize && tickersCoinfalcon[pair.name].bidSecondSize >= pair.ignoreOrderSize){
        targetBid = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bidSecond, 1, pair.digitsPrice);
        config.debug && console.log(new Date().toISOString()+" targetBid => offer higher price than 2th order, add pip if order size is not ignored.");
    } else if(myAccount.coinfalcon.buyData[pair.name].price === 0 && tickersCoinfalcon[pair.name].bid3thSize >= pair.ignoreOrderSize){
        targetBid = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bid3th, 1, pair.digitsPrice);
        config.debug && console.log(new Date().toISOString()+" targetBid => offer higher price than 3th order, add pip if order size is not ignored.");
    } else if(pair.followBitfinexPrice) {
        targetBid = tickersBitfinex[pair.name].bid;
        config.debug && console.log(new Date().toISOString()+" ### tickersCoinfalcon[pair.name].bid "+tickersCoinfalcon[pair.name].bid+" > tickersBitfinex[pair.name].bid "+tickersBitfinex[pair.name].bid+" set buy order to Bitfinex.bid");
    } else {
        //If you have followBitfinexPrice true, you are protected from pay higher price than is on bitfinex.
        if(pair.followBitfinexPrice){
            config.debug && console.log(new Date().toISOString()+" ### Replacing our buy order with lower price following bitfinex price");
            targetBid = tickersBitfinex[pair.name].bid;
        } else {
            console.error("Missing strategy");
        }
    }
    //Validate if new target bid is not close to ask order or taking ask order.
    let askBorderSpreadPips = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].askBorder, pair.pipsSpread, pair.digitsPrice);
    if(targetBid > askBorderSpreadPips) {
        config.debug && console.log(new Date().toISOString()+" ### New target bid "+targetBid+" is in danger zone, need go lower with price");
        targetBid = askBorderSpreadPips;
    }
    //Validate if final bid is lower than buy price order with status = sell (actual pending/open sell order)
    const lowerFilledBuyOrder = await db.getLowestFilledBuyOrder(pair.name);
    if(lowerFilledBuyOrder !== undefined && targetBid >=lowerFilledBuyOrder.buy_price){
        config.debug && console.log(new Date().toISOString()+" ### New target bid collision with lowest filled buy order (pending sell order), -pair.pipsBuySpread ");
        targetBid = tools.takePipsFromPrice( lowerFilledBuyOrder.buy_price, pair.pipsBuySpread, pair.digitsPrice);
    }
    config.debug && console.log(new Date().toISOString()+" targetBid: " + targetBid);
    return targetBid;
}

async function processAskOrder(pair, targetAsk){
    if(myAccount.coinfalcon.available[pair.name.split('-')[0]] >= myAccount.coinfalcon.sellData[pair.name].size){
        config.debug && console.log(new Date().toISOString()+" ### Let´go open new sell order!");
        myAccount = await coinfalcon.createOrder('sell', pair, myAccount, targetAsk);
        apiCounterUsage++;
        await db.setOpenedSellerOrder(pair, myAccount);
    } else {
        console.error("processAskOrder No funds for create sell order");
    }
    return true;
}

async function processBidOrder(pair, targetBid){
    if(myAccount.coinfalcon.available[pair.name.split('-')[1]] >= pair.buyForAmount){
        config.debug && console.log(new Date().toISOString()+" ### Let´go open new buy order!");
        myAccount = await coinfalcon.createOrder('buy', pair, myAccount, targetBid);
        apiCounterUsage++;
        await db.saveOpenedBuyOrder(pair, myAccount);
    }
    return true;
}