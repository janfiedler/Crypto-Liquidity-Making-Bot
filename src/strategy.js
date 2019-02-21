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

let doAskOrder = async function(){
    apiCounter = 0;
    let tickers = {};
    // Parse all currency pair in config and check if is available balance for sell trade
    for(let i=0;i<config.pairs.length;i++){
        let pair = config.pairs[i];
        logMessage = "///////////////////////////// doAskOrder "+pair.name+" ////////////////////////////\n";
        logMessage += JSON.stringify(myAccount)+"\n";
        logMessage += new Date().toISOString()+" ### Lets process ask for "+ pair.name+" in the loop.\n";
        //let sellingForCurrency = pair.name.split('-')[1];
        //let sellingCurrency = pair.name.split('-')[0];

        //Get lowest pending sell order
        const pendingSellOrder = await db.getLowestFilledBuyOrder(config.name, pair);
        if(!pendingSellOrder){
            logMessage += new Date().toISOString()+" ### PendingSellOrder not found, skipp the loop.\n";
            //Nothing to sell, skip the loop.
            continue;
        }
        // Check for actual opened sell order
        const resultOpenedSellOrder = await db.getOpenedSellOrder(config.name, pair);
        //Fetch actual prices from coinfalcon exchange
        const resultTicker = await api.getTicker(pair.name);
        apiCounter++;
        //Parse fetched data to json object.
        if(resultTicker.s){
            tickers[pair.name] = await api.parseTicker("ask", resultTicker.data, pair, resultOpenedSellOrder);
        } else {
            //Return false will start ask process again
            return false;
        }

        let targetAsk = await findSpotForAskOrder(pendingSellOrder, tickers[pair.name] , pair);

        if(typeof resultOpenedSellOrder !== 'undefined' && resultOpenedSellOrder){
            logMessage += new Date().toISOString()+" ### Found opened sell order " + resultOpenedSellOrder.sell_id + "\n";
            if(targetAsk !== resultOpenedSellOrder.sell_price){
                //If founded opened sell order, lets check and process
                const resultValidateOrder = await validateOrder("SELL", resultOpenedSellOrder.sell_id, pair, resultOpenedSellOrder);
                // Only if canceled order was not partially_filled or fulfilled can open new order. Need get actual feed.
                if(resultValidateOrder){
                    await processAskOrder(pair, targetAsk, pendingSellOrder);
                }
            } else {
                logMessage += new Date().toISOString()+" ### We already have opened ask order at " + targetAsk + " skipping validateOrder\n";
            }
        } else {
            logMessage += new Date().toISOString()+" !!! This will be first opened sell order!\n";
            await processAskOrder(pair, targetAsk, pendingSellOrder);
        }
        logMessage += new Date().toISOString()+" ### Success finished "+pair.name+" ASK task, wait: "+(config.sleepPause * apiCounter)+" ms\n";
        logMessage += "//////////////////////////////////////////////////////////////////////////////\n";
        config.debug && console.log(logMessage);
        await tools.sleep(config.sleepPause * apiCounter);
    }
    return true;
};

let doBidOrder = async function (){
    apiCounter = 0;
    let tickers = {};
    // Parse all currency pair in config and check if is available balance for sell trade
    for(let i=0;i<config.pairs.length;i++){
        let pair = config.pairs[i];
        logMessage = "///////////////////////////// doBidOrder "+pair.name+" ////////////////////////////\n";
        logMessage += JSON.stringify(myAccount)+"\n";
        logMessage += new Date().toISOString()+" ### Lets process bid for "+ pair.name+" in the loop.\n";
        //let buyForCurrency = pair.name.split(pair.separator)[1];
        //let buyCurrency = pair.name.split(pair.separator)[0];

        //Get lowest already filled buy order = pending sell order
        const lowestFilledBuyOrder = await db.getLowestFilledBuyOrder(config.name, pair);
        // Check for actual oepend buy order
        const resultOpenedBuyOrder = await db.getOpenedBuyOrder(config.name, pair);
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
            logMessage += new Date().toISOString()+" ### Found opened bid order " + resultOpenedBuyOrder.buy_id+"\n";
            if(targetBid !== resultOpenedBuyOrder.buy_price) {
                //If founded opened buy order, lets check and process
                const resultValidateOrder = await validateOrder("BUY", resultOpenedBuyOrder.buy_id, pair, resultOpenedBuyOrder);
                // Only if canceled order was not partially_filled or fulfilled can open new order. Need get actual feed.
                if(resultValidateOrder){
                    await processBidOrder(pair, targetBid);
                }
            } else {
                logMessage += new Date().toISOString()+" ### We already have opened bid order at " + targetBid + " skipping validateOrder\n";
            }
        } else {
            logMessage += new Date().toISOString()+" !!! This will be first opened buy order!\n";
            await processBidOrder(pair, targetBid);
        }
        logMessage += new Date().toISOString()+" ### Success finished "+pair.name+" BID task, wait: "+(config.sleepPause * apiCounter)+" ms\n";
        logMessage += "//////////////////////////////////////////////////////////////////////////////\n";
        config.debug && console.log(logMessage);
        await tools.sleep(config.sleepPause * apiCounter);
    }
    return true
};

let findSpotForAskOrder = async function (pendingOrder, ticker, pair){
    const keysCount = Object.keys(ticker.ask).length;
    let targetAsk = 99999999;
    if(!config.stickToBigOrders){
        targetAsk = ticker.ask[0].price;
    } else {
        for(let i=0;i<keysCount;i++){
            if ((i+2) >= keysCount){
                break;
            }
            if(ticker.ask[i].size > (ticker.ask[(i+1)].size+ticker.ask[(i+2)].size) && ticker.ask[i].size > pendingOrder.sell_size){
                logMessage += new Date().toISOString()+ " ### "+ticker.ask[i].price + " is my target price with size: " + ticker.ask[i].size+"\n";
                targetAsk = ticker.ask[i].price;
                break;
            }
        }
    }
    targetAsk = tools.takePipsFromPrice(targetAsk, 1, pair.digitsPrice);
    //Validate if new target ask is not close to bid order or taking bid order.
    const bidBorderPipsSpreadFromAsk = tools.addPipsToPrice(ticker.bidBorder, pair.pipsAskBidSpread, pair.digitsPrice);
    if(targetAsk < bidBorderPipsSpreadFromAsk) {
        logMessage += new Date().toISOString()+ "### New target ask "+targetAsk+" is in danger zone bid border "+ticker.bidBorder+", targetAsk = bidBorderPipsSpreadFromAsk: "+bidBorderPipsSpreadFromAsk+"\n";
        targetAsk = bidBorderPipsSpreadFromAsk;
    } else {
        logMessage += new Date().toISOString()+" targetAsk: " + targetAsk+"\n";
    }
    return targetAsk;
};

let findSpotForBidOrder = async function (firstOrder, lowestOrder, buyOrder, ticker, pair){
    const keysCount = Object.keys(ticker.bid).length;
    let targetBid = 0;
    if(firstOrder || !config.stickToBigOrders){
        targetBid = ticker.bid[0].price;
    } else {
        for(let i=0;i<keysCount;i++){
            if ((i+2) >= keysCount){
                break
            }
            if(ticker.bid[i].size > (ticker.bid[(i+1)].size+ticker.bid[(i+2)].size) && ticker.bid[i].size > buyOrder.buy_size){
                logMessage += new Date().toISOString()+ " ### "+ticker.bid[i].price + " is my target price with size: " + ticker.bid[i].size+"\n";
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
            logMessage += new Date().toISOString()+ " ### Target bid " +targetBid+" is higher than previous filled buy order with spread "+bidWithSpread+" included!\n";
            targetBid = bidWithSpread;
        }
    }

    //Validate if new target ask is not close to bid order or taking bid order.
    const askBorderPipsSpreadFromBid = tools.takePipsFromPrice(ticker.askBorder, pair.pipsAskBidSpread, pair.digitsPrice);
    if(targetBid > askBorderPipsSpreadFromBid) {
        logMessage += new Date().toISOString()+ " ### New target bid "+targetBid+" is in danger zone of ask border "+ticker.askBorder+". Target bid = askBorderPipsSpreadFromBid: "+ askBorderPipsSpreadFromBid+"\n";
        targetBid = askBorderPipsSpreadFromBid;
    }else {
        logMessage += new Date().toISOString()+" targetBid: " + targetBid+"\n";
    }
    return targetBid;
};

async function validateOrder(type, id, pair, openedOrder){
    let orderDetail;
    //Before validate order, first we need cancel opened order to avoid changes in data while validating.
    const canceledOrder = await api.cancelOrder(id, type, openedOrder);
    apiCounter++;
    if (canceledOrder.s){
        logMessage += new Date().toISOString() + " ### orderDetail = api.cancelOrder(id)\n";
        orderDetail = canceledOrder.data;
    } else if(!canceledOrder.s && canceledOrder.data.error.includes('not found')){
        //Order was probably canceled manually, sync local DB
        const detailOrder = await api.getOrder(id, type, openedOrder);
        apiCounter++;
        if(detailOrder.s){
            logMessage += new Date().toISOString() + " ### orderDetail = api.getOrder(id)\n";
            orderDetail = detailOrder.data;
        } else {
            logMessage +=  new Date().toISOString() + " !!! Something bad happened when validate canceled order "+id+" !\n";
        }
    } else if(!canceledOrder.s && canceledOrder.data.error.includes('has wrong status.')){
        //Coinfalcon used to respond with this message if the order was not open anymore (fully filled or already cancelled). However they also respond with this (rarely) when the order is still actually open.
        logMessage += new Date().toISOString() + " !!! Catched cancelOrder has wrong status\n";
        return false;
    } else {
        logMessage += new Date().toISOString() + " !!! Catched cancelOrder error\n";
        return false;
    }
    logMessage += JSON.stringify(orderDetail)+"\n";
    //Check if order was partially_filled or fulfilled.
    if(orderDetail.size_filled === 0){
        // Order was not filled
        switch(orderDetail.type){
            case "BUY":
                logMessage += new Date().toISOString() + " ### We have new price, old buy order was canceled\n";
                myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.funds;
                await db.deleteOpenedBuyOrder(orderDetail.id);
                break;
            case "SELL":
                logMessage += new Date().toISOString() + " ### We have new price, old sell order was canceled\n";
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
        logMessage += new Date().toISOString()+" !!! Something bad happened when validateOrder "+orderDetail.id+" !\n";
    }
}

let processFulfilledOrder = function(pair, orderDetail){
    switch(orderDetail.type){
        case "BUY":
            logMessage += new Date().toISOString()+" BID fulfilled\n";
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
            logMessage += new Date().toISOString()+" ### ASK fulfilled\n";
            if(orderDetail.fee > 0){
                switch (config.name) {
                    case "coinfalcon":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "coinmate":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                }
            }
            //We sold, need take size from balance. Available was taken when opening sell order
            myAccount.balance[pair.name.split(pair.separator)[0]] -= orderDetail.size;
            //We sold, need add new size to balance and available
            myAccount.balance[pair.name.split(pair.separator)[1]] += (orderDetail.size_filled*orderDetail.price);
            myAccount.available[pair.name.split(pair.separator)[1]] += (orderDetail.size_filled*orderDetail.price);
            break;
    }
    return true;
};

let processPartiallyFilled = function (pair, orderDetail){
    switch(orderDetail.type){
        case "BUY":
            logMessage += new Date().toISOString()+" BID partially_filled\n";
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
            myAccount.balance[pair.name.split(pair.separator)[0]] += orderDetail.size_filled;
            myAccount.available[pair.name.split(pair.separator)[0]] += orderDetail.size_filled;
            //We bought, need take size from balance. Available was taken when opening buy order
            myAccount.balance[pair.name.split(pair.separator)[1]] -= (orderDetail.size_filled*orderDetail.price);
            //Return rest part of size to available
            myAccount.available[pair.name.split(pair.separator)[1]] += ((orderDetail.size-orderDetail.size_filled)*orderDetail.price);
            break;
        case "SELL":
            logMessage += new Date().toISOString()+" ### ASK partially_filled\n";
            if(orderDetail.fee > 0){
                switch (config.name) {
                    case "coinfalcon":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "coinmate":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                }
            }
            //We sold, need add new size to balance and available
            myAccount.balance[pair.name.split(pair.separator)[1]] += (orderDetail.size_filled*orderDetail.price);
            myAccount.available[pair.name.split(pair.separator)[1]] += (orderDetail.size_filled*orderDetail.price);
            //We sold, need take size from balance. Available was taken when opening sell order
            myAccount.balance[pair.name.split(pair.separator)[0]] -= orderDetail.size_filled;
            //Return rest part of size to available
            myAccount.available[pair.name.split(pair.separator)[0]] += (orderDetail.size-orderDetail.size_filled);

            break;
    }
    return true;
};

async function processAskOrder(pair, targetAsk, pendingSellOrder){
    if(targetAsk === 0){
        logMessage += new Date().toISOString()+" !!! Skipping process ask order because targetAsk === 0!\n";
        return false;
    } else if (myAccount.available[pair.name.split(pair.separator)[0]] < pendingSellOrder.sell_size) {
        logMessage += new Date().toISOString() + " !!! No available " + pair.name.split(pair.separator)[0] + " funds!\n";
        return false;
    } else if (pendingSellOrder.sell_target_price <= targetAsk) {
        logMessage += new Date().toISOString()+" ### Let´go open new sell order!\n";
        const createdOrder = await api.createOrder(pair, "SELL", pendingSellOrder, targetAsk);
        apiCounter++;
        if(createdOrder.s){
            myAccount.available[pair.name.split(pair.separator)[0]] -= createdOrder.data.size;
            await db.setOpenedSellerOrder(pair, pendingSellOrder, createdOrder);
            return false;
        } else {
            if(createdOrder.errorMessage.includes("insufficient size")){
                const failedSellOrder = {"id": pendingSellOrder.buy_id, "status": "insufficient_size"};
                await db.setFailedSellOrder(failedSellOrder);
                logMessage += new Date().toISOString() + " !!! Sell order "+pendingSellOrder.buy_id+" finished due to insufficient order size!\n";
            }
            return false;
        }
    } else {
        logMessage += new Date().toISOString() + " !!! No sell order for this ask price!\n";
        return false;
    }
}

async function processBidOrder(pair, targetBid){
    if(targetBid === 0){
        logMessage += new Date().toISOString()+" !!! Skipping process bid order because targetBid === 0!\n";
        return false;
    } else if (myAccount.available[pair.name.split(pair.separator)[1]] < tools.setPrecisionUp((tools.getBuyOrderSize(pair, targetBid)*targetBid), pair.digitsPrice)){
        logMessage += new Date().toISOString()+" !!! No available "+pair.name.split(pair.separator)[1]+" funds!\n";
        return false;
    } else {
        logMessage += new Date().toISOString()+" ### Let´go open new buy order!\n";
        const createdOrder = await api.createOrder(pair,"BUY",null, targetBid);
        apiCounter++;
        if(createdOrder.s){
            myAccount.available[pair.name.split(pair.separator)[1]] -= createdOrder.data.funds;
            await db.saveOpenedBuyOrder(config.name, pair, createdOrder);
            return true;
        } else {
            logMessage += new Date().toISOString()+" !!! Order not opened!\n";
            return false;
        }
    }
}

module.exports = {
    init: init,
    doAskOrder: doAskOrder,
    doBidOrder: doBidOrder
};
