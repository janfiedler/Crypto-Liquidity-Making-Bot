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
let doOrder = "bid";


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

                //find open price for ask order
                let targetAsk = await findSpotForAsk();

                //Fetch data from database
                const resultOpenedBuyOrder = await db.getOpenedBuyOrder(pair.name);
                myAccount.coinfalcon.sellData[pair.name] = { id: '',
                    price: 0,
                    size: 0,
                    size_filled: 0,
                    fee: 0,
                    funds: 0,
                    created_at: '' };

                if(resultOpenedBuyOrder){
                    //console.log(resultOpenedBuyOrder);
                    myAccount.coinfalcon.sellData[pair.name].id = resultOpenedBuyOrder.sell_id;
                    myAccount.coinfalcon.sellData[pair.name].price = resultOpenedBuyOrder.sell_price;
                }


                if(myAccount.sellId !== ""){
                    const canceled = await checkOrder("ask", targetAsk);
                    if(canceled){
                        console.log(new Date().toISOString()+" My ask order was canceled");
                        //const balance = await coinfalcon.getAccountsBalance();
                        //myAccount = await parseBalance(balance, myAccount);
                        //await fetchCoinfalconOrders();
                        //targetAsk = await findSpotForAsk();
                    }
                } else {
                    //process ask order
                    await processAskOrder(targetAsk);
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
                        break;
                    }
                } else {
                    //process bid order
                    await processBidOrder(pair, targetBid);
                }
            } else {
                console.log("No funds for buy order " + buyCurrency);
            }
        }
        doOrder = "bid";
        return true;
    }
}

async function checkOrder(pair, type, newPrice){
    let canceled = false;
    switch(type){
        case "ask":
            if(newPrice !== myAccount.coinfalcon.sellData[pair.name].price && myAccount.coinfalcon.sellData[pair.name].id !== ""){
                //If new bid price is higher than my actual and it is not close than config.spreadSize to ticksCoinfalcon.ask, than close actual order for make new.
                console.log(new Date().toISOString()+" We have new price, need close old sell order");
                await coinfalcon.cancelOrder(myAccount.coinfalcon.sellData[pair.name].id);
                canceled = true;
            } else if(newPrice === myAccount.coinfalcon.sellData[pair.name].price){
                console.log(new Date().toISOString()+" ### We already have opened ask order at " + newPrice);
            }
            break;
        case "bid":
            if(newPrice !== myAccount.coinfalcon.buyData[pair.name].price && myAccount.coinfalcon.buyData[pair.name].id !== ""){
                //Let´s check order state
                const orderDetail = await coinfalcon.getOrder(myAccount.coinfalcon.buyData[pair.name].id);
                console.log(orderDetail);
                if(orderDetail.data.size_filled > 0){
                    const sell_price = tools.addPipsToPrice(parseFloat(orderDetail.data.price), pair.pipsProfitTarget, pair.digitsPrice);
                    switch(orderDetail.data.status) {
                        case "part-filled":
                            console.log("part-filled");
                            //need cancel order on exchange
                            const resultCancelOrder = await coinfalcon.cancelOrder(myAccount.coinfalcon.buyData[pair.name].id);
                            db.setPendingSellOrder(resultCancelOrder.data.id, orderDetail.data.status, resultCancelOrder.data.size_filled, sell_price);
                            break;
                        case "fulfilled":
                            // do not need close order on exchange, just update info to local db
                            db.setPendingSellOrder(orderDetail.data.id,  orderDetail.data.status, orderDetail.data.size_filled, sell_price);
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
                //If new bid price is higher than my actual and it is not close than config.spreadSize to ticksCoinfalcon.ask, than close actual order for make new.

            } else if(newPrice === myAccount.coinfalcon.buyData[pair.name].price){
                console.log(new Date().toISOString()+" ### We already have opened bid order at " + newPrice);
            }
            break;
    }
    return canceled;
}

async function findSpotForAsk(pair){
    let targetAsk = 0.0000;
    console.log(new Date().toISOString()+" Bitfinex ask: " + tickersBitfinex[pair].ask);
    console.log(new Date().toISOString()+" Coinfalcon ask: " + tickersCoinfalcon[pair].ask);
    console.log(new Date().toISOString()+" Coinfalcon bid: " + tickersCoinfalcon[pair].bid);
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
        //TODO pokracovat zde
    } else if(myAccount.sellId !== ""){
        let preTargetAsk = 0;
        if(preTargetAsk <= tickersBitfinex[pair].bid){
            if((tickersCoinfalcon[pair].askSecond-tickersCoinfalcon[pair].ask) > config.exchanges.coinfalcon.spreadSize && tickersCoinfalcon[pair].askSecond !== myAccount.sellPrice){
                preTargetAsk =  Math.round((tickersCoinfalcon[pair].askSecond+0.0001)*10000)/10000;
                console.log(new Date().toISOString()+" ### targetAsk "+preTargetAsk+" >= tickersBitfinex[pair].ask "+tickersBitfinex[pair].ask+" sell cheaper than second order "+tickersCoinfalcon[pair].askSecond+", add +0.0001");
            } else if((tickersCoinfalcon[pair].askSecond-tickersCoinfalcon[pair].ask) > config.exchanges.coinfalcon.spreadSize && tickersCoinfalcon[pair].askSecond === myAccount.sellPrice){
                if((tickersCoinfalcon[pair].askSecondSize-myAccount.balanceIOT) <= pair.ignoreOrderSize){
                    preTargetAsk = Math.round((tickersCoinfalcon[pair].askSecond+0.0001)*10000)/10000;
                    console.log(new Date().toISOString()+" ### ticksCoinfalcon.askSecond === myAccount.sellPrice and askSecond is  <= pair.ignoreOrderSize go higher find big ask order ");
                } else {
                    preTargetAsk = myAccount.sellPrice;
                    console.log(new Date().toISOString()+" ### ticksCoinfalcon.askSecond === myAccount.sellPrice");
                }
            } else {
                preTargetAsk =  Math.round((tickersCoinfalcon[pair].ask-0.0001)*10000)/10000;
                console.log(new Date().toISOString()+" ### targetAsk "+preTargetAsk+" >= tickersBitfinex[pair].ask "+tickersBitfinex[pair].ask+" sell cheaper than than first order "+tickersCoinfalcon[pair].ask+", add -0.0001");
            }
            targetAsk = preTargetAsk;
        } else {
            targetAsk = tickersBitfinex[pair].ask;
            console.log(new Date().toISOString()+" ### targetBid "+targetAsk+" > tickersBitfinex[pair].ask "+tickersBitfinex[pair].ask+" set buy order to Bitfinex.bid");
        }
    } else {
        // If ask price is not lower than on bitfinex (dont be cheaper than on bitfinex) you can be cheaper than others
        let preTargetAsk = Math.round((tickersCoinfalcon[pair].ask-0.0001)*10000)/10000;
        if(preTargetAsk >= tickersBitfinex[pair].ask){
            targetAsk = preTargetAsk;
            console.log(new Date().toISOString()+" ### targetAsk "+tickersCoinfalcon[pair]+" >= tickersBitfinex[pair].ask "+tickersCoinfalcon[pair].ask+" sell for better price than others "+tickersCoinfalcon[pair].ask+" - 0.0001");
        } else {
            // Else dont go for cheaper price than on bitfinex, stay at bitfinex ask price.
            targetAsk =  tickersBitfinex[pair].ask;
        }
    }
    //Validate if new target ask is not close to bid order or taking bid order.
    if(targetAsk < Math.round((tickersCoinfalcon[pair].bidBorder+config.exchanges.coinfalcon.spreadSize)*10000)/10000) {
        console.log(new Date().toISOString()+ "targetAsk: " + targetAsk);
        console.log(new Date().toISOString()+ "### New target ask is in danger zone, need go higher with price");
        targetAsk = Math.round((tickersCoinfalcon[pair].bidBorder+config.exchanges.coinfalcon.spreadSize)*10000)/10000;
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
        if(preTargetBid <= tickersBitfinex[pair.name].bid){
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
            console.log(new Date().toISOString()+" ### targetBid "+targetBid+" > tickersBitfinex[pair.name].bid "+tickersBitfinex[pair.name].bid+" set buy order to Bitfinex.bid");
        }
    }
    //Validate if new target bid is not close to ask order or taking ask order.
    let askBorderSpreadPips = tools.takePipsFromPrice(tickersCoinfalcon[pair.name].askBorder, pair.spreadSize, pair.digitsPrice);
    if(targetBid > askBorderSpreadPips) {
        console.log(new Date().toISOString()+" ### New target bid is in danger zone, need go lower with price");
        targetBid = askBorderSpreadPips;
    }
    //Validate if final bid is lower than buy bid from sell order
    const lowerFilledBuyOrder = await db.getLowestFilledBuyOrder(pair.name);
    if(lowerFilledBuyOrder !== undefined && targetBid >= lowerFilledBuyOrder.buy_price){
        console.log(new Date().toISOString()+" ### New target bid collision with lowest filled buy order (opened sell order), -1 pip");
        targetBid = tools.takePipsFromPrice( lowerFilledBuyOrder.buy_price, 1, pair.digitsPrice);
    }
    console.log(new Date().toISOString()+" targetBid: " + targetBid);
    return targetBid;
}

async function processAskOrder(pair, targetAsk){
    if(myAccount.coinfalcon.available[pair.name.split('-')[1]] >= myAccount.coinfalcon.buyData[pair.name].size){
        console.log(new Date().toISOString()+" ### Let´go open new sell order!");
        myAccount = await coinfalcon.createOrder('sell', pair, myAccount, targetAsk);
        await db.setOpenedSellerOrder(pair, myAccount);
    }
    return true;
}

async function processBidOrder(pair, targetBid){
    if(myAccount.coinfalcon.balance[pair.name.split('-')[1]] > pair.buyForAmount && myAccount.coinfalcon.available[pair.name.split('-')[1]] > pair.buyForAmount){
        console.log(new Date().toISOString()+" ### Let´go open new buy order!");
        myAccount = await coinfalcon.createOrder('buy', pair, myAccount, targetBid);
        await db.saveOpenedBuyOrder(pair, myAccount);
    }
    return true;
}