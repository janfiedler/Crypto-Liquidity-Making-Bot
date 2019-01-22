let env = process.env.NODE_ENV || 'development';
let config = require('../config')[env];
let request = require('request');
let crypto = require('crypto');
var coinfalcon = require('../coinfalcon');
let db = require('../db/sqlite3');
const tools = require('../src/tools');
// Multi threading
var cp = require('child_process');

// Start with ask order
let doOrder = "ask";


let myAccount = {coinfalcon: {balance: {},available: {},buyData: {}, sellData:{}}};
let tickersCoinfalcon = {};
let tickersBitfinex = {};

// Async Init
(async function () {
    // Promise not compatible with console.log, async is?
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
            console.log(tickersBitfinex);
            if(firstInit){
                firstInit = false;
                begin();
            }
        }
    });
}

async function begin(){
    console.log(new Date().toISOString()+" Let´s call start()");
    const startResult = await start();
    console.log(new Date().toISOString()+ " startResult: " + startResult);
    console.log(new Date().toISOString()+" start() finished, let´s call begin()");
    begin();
}

async function start() {
    console.log(myAccount.coinfalcon.available);

    if(doOrder === "ask"){
        // Parse all currency pair in config and check if is available balance for sell trade
        for(let i=0;i<config.exchanges.coinfalcon.pairs.length;i++){
            let pair = config.exchanges.coinfalcon.pairs[i];
            let sellingForCurrency = pair.name.split('-')[1];
            let sellingCurrency = pair.name.split('-')[0];
            if(myAccount.coinfalcon.available[sellingCurrency] > 0){
                console.log("lets sell " + sellingCurrency + " for " + sellingForCurrency);

                console.log(new Date().toISOString()+" fetch actual prices "+pair.name+" on coinfalcon exchange");
                const resultCoinfalconTicker = await coinfalcon.getTicker(pair.name,2);
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
                    //console.log(resultOpenedSellOrder);
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
                        console.log(new Date().toISOString()+" My ask order was canceled");
                    }
                } else {
                    //process ask order
                    // Need found if we have some pending sell order with targetAsk >= sell_target_price
                    const pendingSellOrder = await db.getPendingSellOrder(pair.name, targetAsk);
                    if(pendingSellOrder){
                        //console.log(pendingSellOrder);
                        myAccount.coinfalcon.sellData[pair.name].size = pendingSellOrder.sell_size;
                        myAccount.coinfalcon.buyData[pair.name].id = pendingSellOrder.buy_id;
                        await processAskOrder(pair, targetAsk);
                    }
                }
            } else {
                console.log("No funds for sell order " + sellingCurrency);
            }

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
                console.log("lets buy " + buyCurrency + " for " + buyForCurrency);

                console.log(new Date().toISOString()+" fetch actual prices "+pair.name+" on coinfalcon exchange");
                const resultCoinfalconTicker = await coinfalcon.getTicker(pair.name,2);
                tickersCoinfalcon[pair.name] = await coinfalcon.parseCoinfalconTicker(resultCoinfalconTicker, pair);
                //console.log(tickersCoinfalcon);

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
                    //console.log(resultOpenedBuyOrder);
                    myAccount.coinfalcon.buyData[pair.name].id = resultOpenedBuyOrder.buy_id;
                    myAccount.coinfalcon.buyData[pair.name].price = resultOpenedBuyOrder.buy_price;
                }

                const targetBid = await findSpotForBid(pair);
                //console.log(targetBid);
                //console.log(myAccount);

                if(myAccount.coinfalcon.buyData[pair.name].id !== ""){
                    let canceled = await checkOrder(pair, "bid", targetBid);
                    if(canceled){
                        console.log(new Date().toISOString()+" My bid order was canceled");
                    }
                } else {
                    //process bid order
                    await processBidOrder(pair, targetBid);
                }
            } else {
                console.log("No funds for buy order " + buyCurrency);
            }
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
                //console.log(orderDetail);
                if(orderDetail.data.size_filled > 0){
                    switch(orderDetail.data.status) {
                        case "part-filled":
                            console.log("part-filled");
                            //need cancel order on exchange
                            const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.sellData[pair.name].id);
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
                            // do not need close order on exchange, just update info to local db
                            if(parseFloat(orderDetail.data.fee) > 0){
                                myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                                myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(orderDetail.data.fee);
                            }
                            await db.setCompletedSellOrder(orderDetail.data.id, orderDetail.data.status, orderDetail.data.size_filled);
                            break;
                        case "canceled":
                            //Skip, forgot delete from DB.
                            console.log("cancel size_filled > 0");
                            await db.deleteOpenedSellOrder(myAccount.coinfalcon.sellData[pair.name].id);
                            break;
                        default:
                            await tools.sleep(99999000);
                            break;
                    }
                } else {
                    switch(orderDetail.data.status) {
                        case "open":
                            console.log(new Date().toISOString()+" We have new price, need close old sell order and delete db record");
                            const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.sellData[pair.name].id);
                            // After cancel order, add funds to available.
                            myAccount.coinfalcon.available[pair.name.split('-')[0]] += parseFloat(resultCancelOrder.data.size);
                            //console.log(resultCancelOrder);
                            myAccount.coinfalcon.sellData[pair.name] = {};
                            if(resultCancelOrder.s){
                                await db.deleteOpenedSellOrder(resultCancelOrder.data.id);
                                canceled = true;
                            } else {
                                canceled = false;
                            }
                            break;
                        case "canceled":
                            //Skip, forgot delete from DB.
                            console.log("canceleled else");
                            await db.deleteOpenedSellOrder(myAccount.coinfalcon.sellData[pair.name].id);
                            break;
                    }
                }
            } else if(newPrice === myAccount.coinfalcon.sellData[pair.name].price){
                console.log(new Date().toISOString()+" ### We already have opened ask order at " + newPrice);
            }
            break;
        case "bid":
            if(newPrice !== myAccount.coinfalcon.buyData[pair.name].price && myAccount.coinfalcon.buyData[pair.name].id !== ""){
                //Let´s check order state
                const orderDetail = await coinfalcon.getOrder(myAccount.coinfalcon.buyData[pair.name].id);
                //console.log(orderDetail);
                if(orderDetail.data.size_filled > 0){
                    const sell_target_price = tools.addPipsToPrice(parseFloat(orderDetail.data.price), pair.pipsProfitTarget, pair.digitsPrice);
                    switch(orderDetail.data.status) {
                        case "part-filled":
                            console.log("part-filled");
                            //need cancel order on exchange
                            const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.buyData[pair.name].id);
                            // After cancel order, add funds to available.
                            myAccount.coinfalcon.available[pair.name.split('-')[1]] += (parseFloat(resultCancelOrder.data.size)-parseFloat(resultCancelOrder.data.size_filled));
                            if(parseFloat(resultCancelOrder.data.fee) > 0){
                                myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= parseFloat(orderDetail.data.fee);
                                myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(resultCancelOrder.data.fee);
                            }
                            await db.setPendingSellOrder(resultCancelOrder.data.id, orderDetail.data.status, resultCancelOrder.data.size_filled, sell_target_price);
                            break;
                        case "fulfilled":
                            // do not need close order on exchange, just update info to local db
                            if(parseFloat(orderDetail.data.fee) > 0){
                                myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= parseFloat(orderDetail.data.fee);
                                myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(orderDetail.data.fee);
                            }
                            await db.setPendingSellOrder(orderDetail.data.id, orderDetail.data.status, orderDetail.data.size_filled, sell_target_price);
                            break;
                        case "canceled":
                            //Skip, forgot delete from DB.
                            console.log("cancel size_filled > 0");
                            await db.deleteOpenedBuyOrder(myAccount.coinfalcon.buyData[pair.name].id);
                            break;
                        default:
                            await tools.sleep(99999000);
                            break;
                    }
                } else {
                    switch(orderDetail.data.status) {
                        case "open":
                            console.log(new Date().toISOString()+" We have new price, need close old buy order and delete db record");
                            const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.buyData[pair.name].id);
                            myAccount.coinfalcon.available[pair.name.split('-')[1]] += parseFloat(resultCancelOrder.data.size);
                            //console.log(resultCancelOrder);
                            myAccount.coinfalcon.buyData[pair.name] = {};
                            if(resultCancelOrder.s){
                                await db.deleteOpenedBuyOrder(resultCancelOrder.data.id);
                                canceled = true;
                            } else {
                                canceled = false;
                            }
                            break;
                        case "canceled":
                            //Skip, forgot delete from DB.
                            console.log("canceleled else");
                            await db.deleteOpenedBuyOrder(myAccount.coinfalcon.buyData[pair.name].id);
                            break;
                    }
                }
            } else if(newPrice === myAccount.coinfalcon.buyData[pair.name].price){
                console.log(new Date().toISOString()+" ### We already have opened bid order at " + newPrice);
            }
            break;
    }
    return canceled;
}

async function findSpotForAsk(pair){
    let targetAsk = 0.0000;
    console.log(new Date().toISOString()+" Bitfinex ask: " + tickersBitfinex[pair.name].ask);
    console.log(new Date().toISOString()+" Coinfalcon ask: " + tickersCoinfalcon[pair.name].ask);
    console.log(new Date().toISOString()+" Coinfalcon bid: " + tickersCoinfalcon[pair.name].bid);
    //console.log(typeof myAccount.sellPrice);
    if(tickersCoinfalcon[pair.name].ask === myAccount.coinfalcon.sellData[pair.name].price){
        console.log(new Date().toISOString()+" ### ticksCoinfalcon.ask is my opened order");
        targetAsk = myAccount.coinfalcon.sellData[pair.name].price;

        if(tickersBitfinex[pair.name].ask > myAccount.coinfalcon.sellData[pair.name].price &&  tickersBitfinex[pair.name].ask < tickersCoinfalcon[pair.name].askSecond){
            console.log(new Date().toISOString()+" ### Replacing our sell order to higher price");
            targetAsk = tickersBitfinex[pair.name].ask;
        }
        /* When we want copy bitfinex ticks
        else if(tickersBitfinex[pair].ask < myAccount.sellPrice &&  tickersBitfinex[pair].ask > Math.round((ticksCoinfalcon.bid+config.spreadSize)*10000)/10000){
            console.log(new Date().toISOString()+" ### Replacing our sell order to lower price");
            targetAsk = tickersBitfinex[pair].ask;
        } else {
            console.log(new Date().toISOString()+" ### No reason for replacing sell order");
        }
        */

        console.log("### ticksCoinfalcon.askSize: " + tickersCoinfalcon[pair.name].askSize);
        console.log("### myAccount.balance"+pair.name.split('-')[0]+": " + myAccount.coinfalcon.balance[pair.name.split('-')[0]]);

        const sizeComparison = tickersCoinfalcon[pair.name].askSize-myAccount.coinfalcon.balance[pair.name.split('-')[0]];
        console.log("### Size comparison: " + sizeComparison);
        // If target price is bigger than actual second order and my buy order is only one bigger than x pair.name, move close to bidSecond
        const askSecondTakeOnePip = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].askSecond, 1, pair.digitsPrice);
        if(targetAsk < askSecondTakeOnePip && sizeComparison <= pair.ignoreOrderSize){
            console.log(new Date().toISOString()+" ### To far away from ticksCoinfalcon.askSecond, take pip from askSecond");
            targetAsk = askSecondTakeOnePip;
        }
    } else {
        let preTargetAsk = 0;
        if(tickersCoinfalcon[pair.name].ask >= tickersBitfinex[pair.name].ask){
            if((tickersCoinfalcon[pair.name].askSecond-tickersCoinfalcon[pair.name].ask) > config.exchanges.coinfalcon.spreadSize && tickersCoinfalcon[pair.name].askSecond !== myAccount.coinfalcon.sellData[pair.name].price){
                preTargetAsk =  Math.round((tickersCoinfalcon[pair].askSecond+0.0001)*10000)/10000;
                console.log(new Date().toISOString()+" ### targetAsk >= tickersBitfinex[pair.name].ask take add pip to second ask order");
            } else if((tickersCoinfalcon[pair.name].askSecond-tickersCoinfalcon[pair.name].ask) > config.exchanges.coinfalcon.spreadSize && tickersCoinfalcon[pair.name].askSecond === myAccount.coinfalcon.sellData[pair.name].price){
                if((tickersCoinfalcon[pair].askSecondSize-myAccount.coinfalcon.balance[pair.name.split('-')[0]]) <= pair.ignoreOrderSize){
                    preTargetAsk = tools.addPipsToPrice(tickersCoinfalcon[pair.name].askSecond, 1, pair.digitsPrice);
                    console.log(new Date().toISOString()+" ### ticksCoinfalcon.askSecond === myAccount.sellPrice and askSecond is  <= pair.ignoreOrderSize go higher find big ask order ");
                } else {
                    preTargetAsk = myAccount.coinfalcon.sellData[pair.name].price;
                    console.log(new Date().toISOString()+" ### ticksCoinfalcon.askSecond === myAccount.sellPrice");
                }
            } else {
                preTargetAsk = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].ask, 1, pair.digitsPrice);
                console.log(new Date().toISOString()+" ### targetAsk >= tickersBitfinex[pair].ask sell cheaper than than first order, take pip");
            }
            targetAsk = preTargetAsk;
        } else {
            console.log(new Date().toISOString()+" ### tickersCoinfalcon[pair.name].ask "+tickersCoinfalcon[pair.name].ask+" < tickersBitfinex[pair.name].ask "+tickersBitfinex[pair.name].ask+" set buy order to Bitfinex.ask");
            targetAsk = tickersBitfinex[pair.name].ask;
        }
    }

    //Validate if new target ask is not close to bid order or taking bid order.
    let bidBorderSpreadPips = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bidBorder, pair.spreadSize, pair.digitsPrice);
    if(targetAsk < bidBorderSpreadPips) {
        console.log(new Date().toISOString()+ "### New target ask is in danger zone, need go higher with price");
        targetAsk = bidBorderSpreadPips;
    }
    console.log(new Date().toISOString()+" targetAsk: " + targetAsk);
    return targetAsk;
}

async function findSpotForBid(pair){
    let targetBid = 0.0000;
    console.log(new Date().toISOString()+" Bitfinex bid "+pair.name+": " + tickersBitfinex[pair.name].bid);
    console.log(new Date().toISOString()+" Coinfalcon ask "+pair.name+": " + tickersCoinfalcon[pair.name].ask);
    console.log(new Date().toISOString()+" Coinfalcon bid "+pair.name+": " + tickersCoinfalcon[pair.name].bid);

    if(tickersCoinfalcon[pair.name].bid === myAccount.coinfalcon.buyData[pair.name].price){
        console.log(new Date().toISOString()+" ### coinfalconBid is my opened order");
        targetBid = myAccount.coinfalcon.buyData[pair.name].price;

        if(tickersBitfinex[pair.name].bid < myAccount.coinfalcon.buyData[pair.name].price && tickersBitfinex[pair.name].bid > tickersCoinfalcon[pair.name].bidSecond){
            console.log(new Date().toISOString()+" ### Replacing our bid order to lower price");
            targetBid = tickersBitfinex[pair.name].bid;
        }
        /* When we want copy bitfinex ticks
        else if(tickersBitfinex[pair.name].bid > myAccount.coinfalcon.buyData[pair.name].price &&  tickersBitfinex[pair.name].bid < Math.round((ticksCoinfalcon.ask-config.coinfalcon.spreadSize)*10000)/10000){
            console.log(new Date().toISOString()+" ### Replacing our bid order to higher price");
            targetBid = tickersBitfinex[pair.name].bid;
        } else {
            console.log(new Date().toISOString()+" ### No reason for replacing bid order");
        }
        */
        console.log("### ticksCoinfalcon.bidSecondSize: " + tickersCoinfalcon[pair.name].bidSize);
        console.log("### myAccount.balance"+pair.name.split('-')[1]+": " + myAccount.coinfalcon.balance[pair.name.split('-')[1]]);

        const sizeComparison = tickersCoinfalcon[pair.name].bidSize-(myAccount.coinfalcon.balance[pair.name.split('-')[1]]/tickersCoinfalcon[pair.name].bid);
        console.log("### Size comparison: " + sizeComparison);
        // If target price is bigger than actual second order and my buy order is only one bigger than x pair.name, move close to bidSecond
        const bidSecondPlusOnePip = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bidSecond, 1, pair.digitsPrice);
        if(targetBid > bidSecondPlusOnePip && sizeComparison <= pair.ignoreOrderSize){
            console.log(new Date().toISOString()+" ### To far away from ticksCoinfalcon.bidSecond, add pip to bidSecond");
            targetBid = bidSecondPlusOnePip;
        }
    } else {
        let preTargetBid = 0;
        if(tickersCoinfalcon[pair.name].bid <= tickersBitfinex[pair.name].bid){
            if((tickersCoinfalcon[pair.name].bid-tickersCoinfalcon[pair.name].bidSecond) > config.exchanges.coinfalcon.spreadSize && tickersCoinfalcon[pair.name].bidSecond !== myAccount.coinfalcon.buyData[pair.name].price){
                console.log(new Date().toISOString()+" ### targetBid <= tickersBitfinex[pair.name].bid add pip to bidSecond");
                preTargetBid = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bidSecond, 1, pair.digitsPrice);
            } else if((tickersCoinfalcon[pair.name].bid-tickersCoinfalcon[pair.name].bidSecond) > config.exchanges.coinfalcon.spreadSize && tickersCoinfalcon[pair.name].bidSecond === myAccount.coinfalcon.buyData[pair.name].price){
                if((tickersCoinfalcon[pair.name].bidSecondSize-(myAccount.coinfalcon.balance[pair.name.split('-')[1]]/tickersCoinfalcon[pair.name].bidSecond)) <= pair.ignoreOrderSize){
                    console.log(new Date().toISOString()+" ### ticksCoinfalcon.bidSecond === myAccount.coinfalcon.buyData[pair.name].price and bidSecond my order <= ignoreOrderSize find true big second order");
                    preTargetBid = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].bidSecond, 1, pair.digitsPrice);
                } else {
                    preTargetBid = myAccount.coinfalcon.buyData[pair.name].price;
                    console.log(new Date().toISOString()+" ### ticksCoinfalcon.bidSecond === myAccount.coinfalcon.buyData[pair.name].price");
                }
            } else {
                preTargetBid = tools.addPipsToPrice(tickersCoinfalcon[pair.name].bid, 1, pair.digitsPrice);
                console.log("preTargetBid: " + preTargetBid);
                console.log(new Date().toISOString()+" ### targetBid <= tickersBitfinex[pair.name].bid add pip to bid");
            }
            targetBid = preTargetBid;
        } else {
            targetBid = tickersBitfinex[pair.name].bid;
            console.log(new Date().toISOString()+" ### tickersCoinfalcon[pair.name].bid "+tickersCoinfalcon[pair.name].bid+" > tickersBitfinex[pair.name].bid "+tickersBitfinex[pair.name].bid+" set buy order to Bitfinex.bid");
        }
    }
    //Validate if new target bid is not close to ask order or taking ask order.
    let askBorderSpreadPips = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].askBorder, pair.spreadSize, pair.digitsPrice);
    if(targetBid > askBorderSpreadPips) {
        console.log(new Date().toISOString()+" ### New target bid is in danger zone, need go lower with price");
        targetBid = askBorderSpreadPips;
    }
    //Validate if final bid is lower than buy bid from pending sell order
    const lowerFilledBuyOrder = await db.getLowestFilledBuyOrder(pair.name);
    if(lowerFilledBuyOrder !== undefined && targetBid >= lowerFilledBuyOrder.buy_price){
        console.log(new Date().toISOString()+" ### New target bid collision with lowest filled buy order (pending sell order), -1 pip");
        targetBid = tools.takePipsFromPrice( lowerFilledBuyOrder.buy_price, pair.pipsBuySpread, pair.digitsPrice);
    }
    console.log(new Date().toISOString()+" targetBid: " + targetBid);
    return targetBid;
}

async function processAskOrder(pair, targetAsk){
    if(myAccount.coinfalcon.available[pair.name.split('-')[0]] >= myAccount.coinfalcon.sellData[pair.name].size){
        console.log(new Date().toISOString()+" ### Let´go open new sell order!");
        myAccount = await coinfalcon.createOrder('sell', pair, myAccount, targetAsk);
        await db.setOpenedSellerOrder(pair, myAccount);
    } else {
        console.error("processAskOrder No funds for create sell order");
    }
    return true;
}

async function processBidOrder(pair, targetBid){
    if(myAccount.coinfalcon.available[pair.name.split('-')[1]] >= pair.buyForAmount){
        console.log(new Date().toISOString()+" ### Let´go open new buy order!");
        myAccount = await coinfalcon.createOrder('buy', pair, myAccount, targetBid);
        await db.saveOpenedBuyOrder(pair, myAccount);
    }
    return true;
}