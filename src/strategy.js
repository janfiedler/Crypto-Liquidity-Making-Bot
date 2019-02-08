const tools = require('../src/tools');

let config;
let myAccount;
let db;
let api;
let apiCounter = 0;
let logMessage;

let init = function (configuration, balance, database, apiExchange){
    config = configuration;
    myAccount = balance;
    db = database;
    api = apiExchange;
};

let findSpotForAskOrder = async function (pendingOrder, ticker, pair){
    const keysCount = Object.keys(ticker.ask).length;
    let targetAsk = 99999999;
    // Need take my size order from market for found real target ask price
    for(let i=0;i<keysCount;i++){
        if ((i+2) >= keysCount){
            break;
        }
        if(ticker.ask[i].size > (ticker.ask[(i+1)].size+ticker.ask[(i+2)].size) && ticker.ask[i].size > pendingOrder.sell_size){
            //console.log(ticker.ask);
            console.log(new Date().toISOString()+ " ### "+ticker.ask[i].price + " is my target price with size: " + ticker.ask[i].size);
            targetAsk = ticker.ask[i].price;
            break;
        }
    }
    targetAsk = tools.takePipsFromPrice(targetAsk, 1, pair.digitsPrice);
    //Validate if new target ask is not close to bid order or taking bid order.
    const bidBorderPipsSpreadFromAsk = tools.addPipsToPrice(ticker.bidBorder, pair.pipsAskBidSpread, pair.digitsPrice);
    if(targetAsk < bidBorderPipsSpreadFromAsk) {
        config.debug && console.log(new Date().toISOString()+ "### New target ask "+targetAsk+" is in danger zone bid border "+ticker.bidBorder+", targetAsk = bidBorderPipsSpreadFromAsk: "+bidBorderPipsSpreadFromAsk);
        targetAsk = bidBorderPipsSpreadFromAsk;
    } else {
        config.debug && console.log(new Date().toISOString()+" targetAsk: " + targetAsk);
    }
    return targetAsk;
};

let findSpotForBidOrder = async function (firstOrder, lowestOrder, buyOrder, ticker, pair){
    const keysCount = Object.keys(ticker.bid).length;
    let targetBid = 0;
    // Need take my size order from market for found real target ask price
    if(firstOrder){
        targetBid = ticker.bid[0].price;
    } else {
        for(let i=0;i<keysCount;i++){
            if ((i+2) >= keysCount){
                break
            }
            if(ticker.bid[i].size > (ticker.bid[(i+1)].size+ticker.bid[(i+2)].size) && ticker.bid[i].size > buyOrder.buy_size){
                //console.log(ticker.bid);
                console.log(new Date().toISOString()+ " ### "+ticker.bid[i].price + " is my target price with size: " + ticker.bid[i].size);
                targetBid = ticker.bid[i].price;
                break;
            }
        }
    }
    targetBid = tools.addPipsToPrice(targetBid, 1, pair.digitsPrice);

    //Validate if targetBid have pips spread between previous lowest filled buy order. (DO NOT BUY for higher price, until this buy order is sell with profit)
    if(lowestOrder){
        const bidWithSpread = tools.takePipsFromPrice( buyOrder.buy_price, pair.pipsBuySpread, pair.digitsPrice);
        if(targetBid > bidWithSpread){
            console.error(new Date().toISOString()+ " ### Target bid " +targetBid+" is higher than previous filled buy order with spread "+bidWithSpread+" included!");
            targetBid = bidWithSpread;
        }
    }

    //Validate if new target ask is not close to bid order or taking bid order.
    const askBorderPipsSpreadFromBid = tools.takePipsFromPrice(ticker.askBorder, pair.pipsAskBidSpread, pair.digitsPrice);
    if(targetBid > askBorderPipsSpreadFromBid) {
        config.debug && console.log(new Date().toISOString()+ "### New target bid "+targetBid+" is in danger zone of ask border "+ticker.askBorder+". Target bid = askBorderPipsSpreadFromBid: "+ askBorderPipsSpreadFromBid );
        targetBid = askBorderPipsSpreadFromBid;
    }else {
        config.debug && console.log(new Date().toISOString()+" targetBid: " + targetBid);
    }
    return targetBid;
};

let processFulfilledOrder = function(pair, orderDetail){
    switch(orderDetail.type){
        case "BUY":
            config.debug && console.log(new Date().toISOString()+" BID fulfilled");
            if(orderDetail.fee > 0){
                switch (config.name) {
                    case "coinfalcon":
                        myAccount.balance[pair.name.split(pair.separator)[0]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[0]] -= orderDetail.fee;
                        break;
                    case "coinmate":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                }
            }
            //We bought, need add new size to balance and available
            myAccount.balance[pair.name.split(pair.separator)[0]] += orderDetail.size;
            myAccount.available[pair.name.split(pair.separator)[0]] += orderDetail.size;
            //We bought, need take size from balance. Available was taken when opening buy order
            myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.funds;
            break;
        case "SELL":
            config.debug && console.log(new Date().toISOString()+" ### ASK fulfilled");
            if(orderDetail.fee > 0){
                myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
            }
            //We sold, need take size from balance. Available was taken when opening sell order
            myAccount.balance[pair.name.split(pair.separator)[0]] -= orderDetail.size;
            //We sold, need add new size to balance and available
            myAccount.balance[pair.name.split(pair.separator)[1]] += orderDetail.funds;
            myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.funds;
            break;
    }
    return true;
};

let processPartiallyFilled = function (pair, orderDetail){
    switch(orderDetail.type){
        case "BUY":
            config.debug && console.log(new Date().toISOString()+" BID partially_filled");
            if(orderDetail.fee > 0){
                myAccount.balance[pair.name.split(pair.separator)[0]] -= orderDetail.fee;
                myAccount.available[pair.name.split(pair.separator)[0]] -= orderDetail.fee;
            }
            //We bought, need add new size to balance and available
            myAccount.balance[pair.name.split(pair.separator)[0]] += orderDetail.size_filled;
            myAccount.available[pair.name.split(pair.separator)[0]] += orderDetail.size_filled;
            //We bought, need take size from balance. Available was taken when opening buy order
            myAccount.balance[pair.name.split(pair.separator)[1]] -= (orderDetail.size_filled*orderDetail.price);
            break;
        case "SELL":
            config.debug && console.log(new Date().toISOString()+" ### ASK partially_filled");
            if(orderDetail.fee > 0){
                myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
            }
            //We sold, need take size from balance. Available was taken when opening sell order
            myAccount.balance[pair.name.split(pair.separator)[0]] -= orderDetail.size_filled;
            //We sold, need add new size to balance and available
            myAccount.balance[pair.name.split(pair.separator)[1]] += (orderDetail.size_filled*orderDetail.price);
            myAccount.available[pair.name.split(pair.separator)[1]] += (orderDetail.size_filled*orderDetail.price);

            break;
    }
    return true;
};

let doAskOrder = async function(){
    apiCounter = 0;
    let tickers = {};
    // Parse all currency pair in config and check if is available balance for sell trade
    for(let i=0;i<config.pairs.length;i++){
        let pair = config.pairs[i];
        config.debug && console.log(new Date().toISOString()+" ### Lets process ask for "+ pair.name+" in the loop.");
        //let sellingForCurrency = pair.name.split('-')[1];
        //let sellingCurrency = pair.name.split('-')[0];

        //Get lowest pending sell order
        const pendingSellOrder = await db.getLowestFilledBuyOrder(config.name, pair.name);
        //console.log(pendingSellOrder);
        if(!pendingSellOrder){
            config.debug && console.log(new Date().toISOString()+" ### PendingSellOrder not found, skipp the loop.");
            //Nothing to sell, skip the loop.
            continue;
        }
        // Check for actual opened sell order
        const resultOpenedSellOrder = await db.getOpenedSellOrder(config.name, pair.name);
        //Fetch actual prices from coinfalcon exchange
        const resultTicker = await api.getTicker(pair.name);
        apiCounter++;
        //console.log(resultCoinfalconTicker);
        //Parse fetched data to json object.
        if(resultTicker.s){
            tickers[pair.name] = await api.parseTicker("ask", resultTicker.data, pair, resultOpenedSellOrder);
        } else {
            //Return false will start ask process again
            return false;
        }

        let targetAsk = await findSpotForAskOrder(pendingSellOrder, tickers[pair.name] , pair);

        if(typeof resultOpenedSellOrder !== 'undefined' && resultOpenedSellOrder){
            config.debug && console.log(new Date().toISOString()+" ### Found opened sell order " + resultOpenedSellOrder.sell_id);
            if(targetAsk !== tools.setPrecision(resultOpenedSellOrder.sell_price, pair.digitsPrice)){
                //If founded opened sell order, lets check and process
                const resultValidateOrder = await validateOrder("SELL", resultOpenedSellOrder.sell_id, pair, resultOpenedSellOrder);
                // Only if canceled order was not partially_filled or fulfilled can open new order. Need get actual feed.
                if(resultValidateOrder){
                    await processAskOrder(pair, targetAsk, pendingSellOrder);
                }
            } else {
                config.debug && console.log(new Date().toISOString()+" ### We already have opened ask order at " + targetAsk + " skipping validateOrder");
            }
        } else {
            config.debug && console.log(new Date().toISOString()+" !!! This will be first opened sell order!");
            await processAskOrder(pair, targetAsk, pendingSellOrder);
        }

        config.debug && console.log(new Date().toISOString()+" ### Success finished "+pair.name+" ASK task, wait: "+(config.sleepPause * apiCounter)+" ms");
        await tools.sleep(config.sleepPause * apiCounter);
    }
};

let doBidOrder = async function (){
    apiCounter = 0;
    let tickers = {};
    // Parse all currency pair in config and check if is available balance for sell trade
    for(let i=0;i<config.pairs.length;i++){
        let pair = config.pairs[i];

        config.debug && console.log(new Date().toISOString()+" ### Lets process bid for "+ pair.name+" in the loop.");
        //let buyForCurrency = pair.name.split(pair.separator)[1];
        //let buyCurrency = pair.name.split(pair.separator)[0];

        //Get lowest already filled buy order = pending sell order
        const lowestFilledBuyOrder = await db.getLowestFilledBuyOrder(config.name, pair.name);
        // Check for actual oepend buy order
        const resultOpenedBuyOrder = await db.getOpenedBuyOrder(config.name, pair.name);
        //console.log(resultOpenedBuyOrder);
        //Fetch actual prices from coinfalcon exchange
        const resultTicker = await api.getTicker(pair.name);

        apiCounter++;
        //Parse fetched data to json object.
        if(resultTicker.s){
            tickers[pair.name] = await api.parseTicker("bid", resultTicker.data, pair, resultOpenedBuyOrder);
        } else {
            //Return false will start ask process again
            return false;
        }

        let targetBid;
        if(lowestFilledBuyOrder){
            targetBid = await findSpotForBidOrder(false, true, lowestFilledBuyOrder, tickers[pair.name] , pair);
        } else if(resultOpenedBuyOrder){
            targetBid = await findSpotForBidOrder(false, false, resultOpenedBuyOrder, tickers[pair.name] , pair);
        } else {
            targetBid = await findSpotForBidOrder(true,  false, null, tickers[pair.name] , pair);
        }

        if(typeof resultOpenedBuyOrder !== 'undefined' && resultOpenedBuyOrder){
            config.debug && console.log(new Date().toISOString()+" ### Found opened bid order " + resultOpenedBuyOrder.buy_id);
            if(targetBid !== tools.setPrecision(resultOpenedBuyOrder.buy_price, pair.digitsPrice)) {
                //If founded opened buy order, lets check and process
                const resultValidateOrder = await validateOrder("BUY", resultOpenedBuyOrder.buy_id, pair, resultOpenedBuyOrder);
                // Only if canceled order was not partially_filled or fulfilled can open new order. Need get actual feed.
                if(resultValidateOrder){
                    await processBidOrder(pair, targetBid);
                }
            } else {
                config.debug && console.log(new Date().toISOString()+" ### We already have opened bid order at " + targetBid + " skipping validateOrder");
            }
        } else {
            config.debug && console.log(new Date().toISOString()+" !!! This will be first opened buy order!");
            await processBidOrder(pair, targetBid);
        }

        config.debug && console.log(new Date().toISOString()+" ### Success finished "+pair.name+" BID task, wait: "+(config.sleepPause * apiCounter)+" ms");
        await tools.sleep(config.sleepPause * apiCounter);
    }

};

async function validateOrder(type, id, pair, openedOrder){
    let orderDetail;
    //Before validate order, first we need cancel opened order to avoid changes in data while validating.
    const canceledOrder = await api.cancelOrder(id, type, openedOrder);
    apiCounter++;
    if (canceledOrder.s){
        config.debug && console.log(new Date().toISOString() + " ### orderDetail = api.cancelOrder(id)");
        orderDetail = canceledOrder.data;
    } else if(!canceledOrder.s && canceledOrder.data.error.includes('not found')){
        //Order was probably canceled manually, sync local DB
        const detailOrder = await api.getOrder(id, type, openedOrder);
        apiCounter++;
        if(detailOrder.s){
            config.debug && console.log(new Date().toISOString() + " ### orderDetail = api.getOrder(id)");
            orderDetail = detailOrder.data;
        } else {
            console.error("Something bad happened when validate canceled order "+id+" !");
        }
    } else if(!canceledOrder.s && canceledOrder.data.error.includes('has wrong status.')){
        //Coinfalcon used to respond with this message if the order was not open anymore (fully filled or already cancelled). However they also respond with this (rarely) when the order is still actually open.
        console.error("Catched cancelOrder has wrong status");
        return false;
    } else {
        console.error("Catched cancelOrder error!");
        return false;
    }
    config.debug && console.log(orderDetail);
    //Check if order was partially_filled or fulfilled.
    if(orderDetail.size_filled === 0){
        // Order was not filled
        switch(orderDetail.type){
            case "BUY":
                config.debug && console.log(new Date().toISOString() + " ### We have new price, old buy order was canceled");
                myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.funds;
                await db.deleteOpenedBuyOrder(orderDetail.id);
                break;
            case "SELL":
                config.debug && console.log(new Date().toISOString() + " ### We have new price, old sell order was canceled");
                myAccount.available[pair.name.split(pair.separator)[0]] += orderDetail.size;
                await db.deleteOpenedSellOrder(orderDetail.id);
                break;
        }
        return true;
    } else if(orderDetail.size_filled === orderDetail.size){
        // Order was fulfilled
        switch(orderDetail.type){
            case "BUY":
                const sell_target_price = tools.getProfitTargetPrice(orderDetail.price, pair.percentageProfitTarget, pair.digitsPrice);
                await db.setPendingSellOrder(orderDetail, sell_target_price);
                break;
            case "SELL":
                await db.setCompletedSellOrder(orderDetail);
                break;
        }
        await processFulfilledOrder(pair, orderDetail);
        return false;
    } else if(orderDetail.size_filled < orderDetail.size){
        // Order was partially_filled
        switch(orderDetail.type){
            case "BUY":
                const sell_target_price = tools.getProfitTargetPrice(orderDetail.price, pair.percentageProfitTarget, pair.digitsPrice);
                await db.setPendingSellOrder(orderDetail, sell_target_price);
                break;
            case "SELL":
                await db.setCompletedSellOrder(orderDetail);
                await db.reOpenPartFilledSellOrder(config.name, pair, openedOrder, (orderDetail.size-orderDetail.size_filled));
                break;
        }
        await processPartiallyFilled(pair, orderDetail);
        return false;
    } else {
        console.error("Something bad happened when validateOrder "+orderDetail.id+" !");
    }
}

async function processAskOrder(pair, targetAsk, pendingSellOrder){
    if(targetAsk === 0){
        config.debug && console.error(new Date().toISOString()+" !!! Skipping process ask order because targetAsk === 0!");
        return false;
    } else if (myAccount.available[pair.name.split(pair.separator)[0]] < tools.setPrecision(pendingSellOrder.sell_size, pair.digitsSize)) {
        config.debug && console.error(new Date().toISOString() + " !!! No available " + pair.name.split(pair.separator)[0] + " funds!");
        return false;
    } else if (tools.setPrecision(pendingSellOrder.sell_target_price, pair.digitsPrice) <= targetAsk) {
        config.debug && console.log(new Date().toISOString()+" ### Let´go open new sell order!");
        const createdOrder = await api.createOrder(pair, "SELL", pendingSellOrder, targetAsk);
        apiCounter++;
        if(createdOrder.s){
            myAccount.available[pair.name.split(pair.separator)[0]] -= createdOrder.data.size;
            await db.setOpenedSellerOrder(pair, pendingSellOrder, createdOrder);
            return false;
        } else {
            return false;
        }
    } else {
        config.debug && console.log(new Date().toISOString() + " !!! No sell order for this ask price!");
        return false;
    }
}

async function processBidOrder(pair, targetBid){
    if(targetBid === 0){
        config.debug && console.error(new Date().toISOString()+" !!! Skipping process bid order because targetBid === 0!");
        return false;
    } else if (myAccount.available[pair.name.split(pair.separator)[1]] < tools.setPrecisionUp((pair.buyForAmount/targetBid), pair.digitsPrice)){
        config.debug && console.error(new Date().toISOString()+" !!! No available "+pair.name.split(pair.separator)[1]+" funds!");
        return false;
    } else {
        config.debug && console.log(new Date().toISOString()+" ### Let´go open new buy order!");
        const createdOrder = await api.createOrder(pair,"BUY",null, targetBid);
        apiCounter++;
        if(createdOrder.s){
            myAccount.available[pair.name.split(pair.separator)[1]] -= createdOrder.data.funds;
            await db.saveOpenedBuyOrder(config.name, pair, createdOrder);
            return true;
        } else {
            return false;
        }
    }
}

module.exports = {
    init: init,
    doAskOrder: doAskOrder,
    doBidOrder: doBidOrder
};
