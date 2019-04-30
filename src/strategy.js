const tools = require('../src/tools');

let config;
let myAccount;
let db;
let api;
let apiCounter = 0;
let logMessage;
let lastLogMessage = [];
let lastTickers = {};

let init = function (configuration, balance, database, apiExchange){
    config = configuration;
    myAccount = balance;
    db = database;
    api = apiExchange;

    for(let i=0;i<config.pairs.length;i++){
        let pair = config.pairs[i];
        lastLogMessage[pair.name+"_"+pair.id] = {"ask": "", "bid": ""};
        lastTickers[pair.name+"_"+pair.id] = {"ask": "", "bid": "", "timestamp": {"ask": Date.now(), "bid": Date.now()} };
    }
};

let doAskOrder = async function(){
    let tickers = {};
    // Parse all currency pair in config and check if is available balance for sell trade
    for(let i=0;i<config.pairs.length;i++){
        if(!config.pairs[i].active){
            logMessage = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            logMessage += " ### Pair "+ config.pairs[i].name +" is disabled.\n";
            logMessage += "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            if(config.debug && lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].ask !== logMessage){
                config.debug && console.log("\r\n"+logMessage);
                lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].ask = logMessage;
            }
            //Need throttling for disabled pair to avoid full cpu usage and problem with stopping bot in correct way.
            await tools.sleep(1);
            continue;
        }
        let pair = config.pairs[i];
        apiCounter = 0;
        logMessage = " ### Lets process ask for "+ pair.name+" in the loop.\n";
        //let sellingForCurrency = pair.name.split('-')[1];
        //let sellingCurrency = pair.name.split('-')[0];

        //Get lowest pending sell order
        const pendingSellOrder = await db.getLowestSellTargetPrice(config.name, pair);
        if(!pendingSellOrder){
            logMessage += " ### PendingSellOrder not found, skipp the loop.\n";
            //Nothing to sell, skip the loop.
            continue;
        }
        // Check for actual opened sell order
        const resultOpenedSellOrder = await db.getOpenedSellOrder(config.name, pair);
        //Fetch actual prices from coinfalcon exchange
        const resultTicker = await api.getTicker(pair.name);
        if(resultTicker.counter){
            apiCounter++;
        }
        //Parse fetched data to json object.
        if(resultTicker.s){
            tickers[pair.name] = await api.parseTicker("ask", resultTicker.data, pair, resultOpenedSellOrder);
            //Performance optimization, process only if orders book change
            if ((Date.now() - lastTickers[pair.name+"_"+pair.id].timestamp.ask) > 600000 || JSON.stringify(lastTickers[pair.name+"_"+pair.id].ask) !== JSON.stringify(tickers[pair.name])) {
                //Performance optimization, send ask/bid price only when is different
                if (lastTickers[pair.name+"_"+pair.id].ask.askBorder !== tickers[pair.name].askBorder) {
                    process.send({
                        "type": "ticker",
                        "exchange": config.name,
                        "pair": pair,
                        "tick": {"ask": tickers[pair.name].askBorder, "bid": tickers[pair.name].bidBorder}
                    });
                }
                lastTickers[pair.name+"_"+pair.id].ask = tickers[pair.name];
            } else {
                logMessage += " !!! Price didn't change, skip the loop.\n";
                await processFinishLoop(apiCounter, pair, "ask", lastLogMessage[pair.name+"_"+pair.id].ask, logMessage);
                continue;
            }
        } else {
            //Return false will skip ask process and start bid process.
            return false;
        }

        let targetAsk = await findSpotForAskOrder(pendingSellOrder, tickers[pair.name] , pair);

        if(typeof resultOpenedSellOrder !== 'undefined' && resultOpenedSellOrder){
            logMessage += " ### Found opened sell order " + resultOpenedSellOrder.sell_id + "\n";
            //If targetAsk dont change after ten minutes, force validate order.
            if((Date.now() - lastTickers[pair.name+"_"+pair.id].timestamp.ask) > 600000 || targetAsk !== resultOpenedSellOrder.sell_price){
                lastTickers[pair.name+"_"+pair.id].timestamp.ask = Date.now();
                //If founded opened sell order, lets check and process
                const resultValidateOrder = await validateOrder("SELL", resultOpenedSellOrder.sell_id, pair, resultOpenedSellOrder);
                // Only if canceled order was not partially_filled or fulfilled can open new order. Need get actual feed.
                if(resultValidateOrder){
                    await processAskOrder(pair, tickers[pair.name], targetAsk, pendingSellOrder);
                } else {
                    await processFinishLoop(apiCounter, pair, "ask", lastLogMessage[pair.name+"_"+pair.id].ask, logMessage);
                    return false;
                }
            } else {
                logMessage += " ### We already have opened ask order at " + targetAsk + " skipping validateOrder\n";
            }
        } else {
            logMessage += " !!! This will be first opened sell order!\n";
            await processAskOrder(pair, tickers[pair.name], targetAsk, pendingSellOrder);
        }

        await processFinishLoop(apiCounter, pair, "ask", lastLogMessage[pair.name+"_"+pair.id].ask, logMessage);
    }
    return true;
};

let doBidOrder = async function (){
    let tickers = {};
    // Parse all currency pair in config and check if is available balance for sell trade
    for(let i=0;i<config.pairs.length;i++){
        if(!config.pairs[i].active){
            logMessage = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            logMessage += " ### Pair "+ config.pairs[i].name +" is disabled.\n";
            logMessage += "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            if(config.debug && lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].bid !== logMessage){
                config.debug && console.log("\r\n"+logMessage);
                lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].bid = logMessage;
            }
            //Need throttling for disabled pair to avoid full cpu usage and problem with stopping bot in correct way.
            await tools.sleep(1);
            continue;
        } else if (config.pairs[i].bagHolderLimit > 0 && config.pairs[i].bagHolderLimit <= await db.getTotalSellSize(config.name, config.pairs[i]) ){
            logMessage = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            logMessage += " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" reached maximum bag holder limit. We do not need to buy more.\n";
            logMessage += "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            if(config.debug && lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].bid !== logMessage){
                config.debug && console.log("\r\n"+logMessage);
                lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].bid = logMessage;
            }
            //Need throttling for disabled pair to avoid full cpu usage and problem with stopping bot in correct way.
            await tools.sleep(1);
            continue;
        } else if (config.pairs[i].budgetLimit > 0 && config.pairs[i].budgetLimit <= await tools.getAmountSpent(db, config.name, config.pairs[i])){
            logMessage = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            logMessage += " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" reached maximum budget limit. We do not need to buy more.\n";
            logMessage += "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            if(config.debug && lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].bid !== logMessage){
                config.debug && console.log("\r\n"+logMessage);
                lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].bid = logMessage;
            }
            //Need throttling for disabled pair to avoid full cpu usage and problem with stopping bot in correct way.
            await tools.sleep(1);
            continue;
        }
        let pair = config.pairs[i];
        apiCounter = 0;
        logMessage = " ### Lets process bid for "+ pair.name+" in the loop.\n";
        //let buyForCurrency = pair.name.split(pair.separator)[1];
        //let buyCurrency = pair.name.split(pair.separator)[0];

        //Get lowest already filled buy order = pending sell order
        const lowestFilledBuyOrder = await db.getLowestFilledBuyOrder(config.name, pair);
        // Check for actual opened buy order
        const resultOpenedBuyOrder = await db.getOpenedBuyOrder(config.name, pair);
        //Fetch actual prices from coinfalcon exchange
        const resultTicker = await api.getTicker(pair.name);
        if(resultTicker.counter){
            apiCounter++;
        }
        //Parse fetched data to json object.
        if(resultTicker.s){
            tickers[pair.name] = await api.parseTicker("bid", resultTicker.data, pair, resultOpenedBuyOrder);

            //Performance optimization, process only if orders book change
            if ((Date.now() - lastTickers[pair.name+"_"+pair.id].timestamp.bid) > 600000 || JSON.stringify(lastTickers[pair.name+"_"+pair.id].bid) !== JSON.stringify(tickers[pair.name])) {
                //Performance optimization, send ask/bid price only when is different
                if (lastTickers[pair.name+"_"+pair.id].bid.bidBorder !== tickers[pair.name].bidBorder) {
                    process.send({
                        "type": "ticker",
                        "exchange": config.name,
                        "pair": pair,
                        "tick": {"ask": tickers[pair.name].askBorder, "bid": tickers[pair.name].bidBorder}
                    });
                }
                lastTickers[pair.name+"_"+pair.id].bid = tickers[pair.name];
            } else {
                logMessage += " !!! Price didn't change, skip the loop.\n";
                await processFinishLoop(apiCounter, pair, "bid", lastLogMessage[pair.name+"_"+pair.id].bid, logMessage);
                await tools.sleep(1);
                continue;
            }
        } else {
            //Return false will skip bid process and start ask process.
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
            logMessage += " ### Found opened bid order " + resultOpenedBuyOrder.buy_id+"\n";
            //If targetBid dont change after ten minutes, force validate order.
            if((Date.now() - lastTickers[pair.name+"_"+pair.id].timestamp.bid) > 600000 || targetBid !== resultOpenedBuyOrder.buy_price) {
                lastTickers[pair.name+"_"+pair.id].timestamp.bid = Date.now();
                //If founded opened buy order, lets check and process
                const resultValidateOrder = await validateOrder("BUY", resultOpenedBuyOrder.buy_id, pair, resultOpenedBuyOrder);
                // Only if canceled order was not partially_filled or fulfilled can open new order. Need get actual feed.
                if(resultValidateOrder){
                    await processBidOrder(pair, targetBid);
                } else {
                    await processFinishLoop(apiCounter, pair, "bid", lastLogMessage[pair.name+"_"+pair.id].bid, logMessage);
                    return false;
                }
            } else {
                logMessage += " ### We already have opened bid order at " + targetBid + " skipping validateOrder\n";
            }
        } else {
            logMessage += " !!! This will be first opened buy order!\n";
            await processBidOrder(pair, targetBid);
        }

        await processFinishLoop(apiCounter, pair, "bid", lastLogMessage[pair.name+"_"+pair.id].bid, logMessage);
    }
    return true;
};

let findSpotForAskOrder = async function (pendingOrder, ticker, pair){
    const keysCount = Object.keys(ticker.ask).length;
    let targetAsk = 99999999;
    if(typeof ticker.ask[0].price !== 'undefined' && ticker.ask[0].price){
        if(!config.stickToBigOrders){
            targetAsk = ticker.ask[0].price;
        } else {
            for(let i=0;i<keysCount;i++){
                if ((i+2) >= keysCount){
                    break;
                }
                if(ticker.ask[i].size > (ticker.ask[(i+1)].size+ticker.ask[(i+2)].size) && ticker.ask[i].size > pendingOrder.sell_size){
                    logMessage += " ### "+ticker.ask[i].price + " is my target price with size: " + ticker.ask[i].size+"\n";
                    targetAsk = ticker.ask[i].price;
                    break;
                }
            }
        }
    }
    targetAsk = tools.takePipsFromPrice(targetAsk, 1, pair.digitsPrice);
    //Validate if new target ask is not close to bid order or taking bid order.
    const bidBorderPipsSpreadFromAsk = tools.addPipsToPrice(ticker.bidBorder, pair.pipsAskBidSpread, pair.digitsPrice);
    if(targetAsk < bidBorderPipsSpreadFromAsk) {
        logMessage += "### New target ask "+targetAsk+" is in danger zone bid border "+ticker.bidBorder+", targetAsk = bidBorderPipsSpreadFromAsk: "+bidBorderPipsSpreadFromAsk+"\n";
        targetAsk = bidBorderPipsSpreadFromAsk;
    } else {
        logMessage += " targetAsk: " + targetAsk+"\n";
    }
    return targetAsk;
};

let findSpotForBidOrder = async function (firstOrder, lowestOrder, buyOrder, ticker, pair){
    const keysCount = Object.keys(ticker.bid).length;
    let targetBid = 0;
    if(typeof ticker.bid[0].price !== 'undefined' && ticker.bid[0].price){
        if(firstOrder || !config.stickToBigOrders){
            targetBid = ticker.bid[0].price;
        } else {
            for(let i=0;i<keysCount;i++){
                if ((i+2) >= keysCount){
                    break
                }
                if(ticker.bid[i].size > (ticker.bid[(i+1)].size+ticker.bid[(i+2)].size) && ticker.bid[i].size > buyOrder.buy_size){
                    logMessage += " ### "+ticker.bid[i].price + " is my target price with size: " + ticker.bid[i].size+"\n";
                    targetBid = ticker.bid[i].price;
                    break;
                }
            }
        }
    }
    targetBid = tools.addPipsToPrice(targetBid, 1, pair.digitsPrice);

    //Validate if targetBid have pips spread between previous lowest filled buy order. (DO NOT BUY for higher price, until this buy order is sold)
    if(lowestOrder){
        let bidWithSpread;
        if(pair.percentageBuySpread === 0){
            bidWithSpread = tools.takePipsFromPrice( buyOrder.buy_price, pair.pipsBuySpread, pair.digitsPrice);
        } else {
            bidWithSpread = tools.getPercentageBuySpread(buyOrder.buy_price, pair.percentageBuySpread, pair.digitsPrice);
        }

        if(targetBid > bidWithSpread){
            logMessage += " ### Target bid " +targetBid+" is higher than previous filled buy order with spread "+bidWithSpread+" !\n";
            targetBid = bidWithSpread;
            for(let i=0;i<keysCount;i++){
                if(ticker.bid[i].price <  bidWithSpread){
                    targetBid = tools.addPipsToPrice(ticker.bid[i].price, 1, pair.digitsPrice);
                    break;
                }
            }
        }
    }

    //Validate if new target ask is not close to bid order or taking bid order.
    const askBorderPipsSpreadFromBid = tools.takePipsFromPrice(ticker.askBorder, pair.pipsAskBidSpread, pair.digitsPrice);
    if(targetBid > askBorderPipsSpreadFromBid) {
        logMessage += " ### New target bid "+targetBid+" is in danger zone of ask border "+ticker.askBorder+". Target bid = askBorderPipsSpreadFromBid: "+ askBorderPipsSpreadFromBid+"\n";
        targetBid = askBorderPipsSpreadFromBid;
    }else {
        logMessage += " ### targetBid: " + targetBid+"\n";
    }
    return targetBid;
};

async function validateOrder(type, id, pair, openedOrder){
    let orderDetail;
    //Before validate order, first we need cancel opened order to avoid changes in data while validating.
    const canceledOrder = await api.cancelOrder(pair, id, type, openedOrder);
    apiCounter++;
    if (canceledOrder.s){
        logMessage += " ### orderDetail = api.cancelOrder(id)\n";
        orderDetail = canceledOrder.data;
    } else if(!canceledOrder.s && canceledOrder.data.error.includes('not found')){
        //Order was probably canceled manually, sync local DB
        const detailOrder = await api.getOrder(pair, id, type, openedOrder);
        apiCounter++;
        if(detailOrder.s){
            logMessage += " ### orderDetail = api.getOrder(id)\n";
            orderDetail = detailOrder.data;
        } else {
            logMessage +=  " !!! Something bad happened when validate canceled order "+id+" !\n";
            return false
        }
    } else if(!canceledOrder.s && canceledOrder.data.error.includes('has wrong status.')){
        //Coinfalcon used to respond with this message if the order was not open anymore (fully filled or already cancelled). However they also respond with this (rarely) when the order is still actually open.
        logMessage += " !!! Catched cancelOrder has wrong status\n";
        return false;
    } else {
        logMessage += " !!! Catched cancelOrder error\n";
        return false;
    }
    logMessage += JSON.stringify(orderDetail)+"\n";
    //Check if order was partially_filled or fulfilled.
    if(orderDetail.size_filled === 0){
        // Order was not filled
        switch(orderDetail.type){
            case "BUY":
                logMessage += " ### We have new price, old buy order was canceled\n";
                myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.funds;
                await db.deleteOpenedBuyOrder(orderDetail.id);
                break;
            case "SELL":
                logMessage += " ### We have new price, old sell order was canceled\n";
                myAccount.available[pair.name.split(pair.separator)[0]] += orderDetail.size;
                await db.deleteOpenedSellOrder(orderDetail.id);
                //If canceled sell older was set for sell in loose, reset sell_target_price for new round for case we can sell another pending sell older in profit.
                if(pair.sellOldestOrderWithLoss && openedOrder.sell_target_price === 0){
                    const sell_target_price = tools.getProfitTargetPrice(openedOrder.buy_price, pair.percentageProfitTarget, pair.digitsPrice);
                    logMessage += " $$$ Set again profit target: " + sell_target_price + " \n";
                    logMessage += JSON.stringify(openedOrder)+"\n";
                    await db.setSellTargetPrice(config.name, pair, openedOrder.buy_id, sell_target_price);
                }
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
                await processCalculateProfit(pair, orderDetail);
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
                await processCalculateProfit(pair, orderDetail);
                break;
        }

        await processPartiallyFilled(pair, orderDetail);
        return false;
    } else {
        logMessage += " !!! Something bad happened when validateOrder "+orderDetail.id+" !\n";
    }
}

let processCalculateProfit = async function(pair, orderDetail){
    const completedOrder = await db.getCompletedOrder(orderDetail.id);
    const profit = tools.calculateProfit(config.name, completedOrder);
    process.send({
        "type": "completedOrder",
        "pair": pair,
        "order": completedOrder,
        "profit": profit
    });
    await db.updateProfit(profit, completedOrder.sell_id);
};

let processFulfilledOrder = function(pair, orderDetail){
    switch(orderDetail.type){
        case "BUY":
            logMessage += " BID fulfilled\n";
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
            //We bought, need add new size to balance and available
            myAccount.balance[pair.name.split(pair.separator)[0]] += orderDetail.size;
            myAccount.available[pair.name.split(pair.separator)[0]] += orderDetail.size;
            //We bought, need take size from balance. Available was taken when opening buy order
            myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.funds;
            break;
        case "SELL":
            logMessage += " ### ASK fulfilled\n";
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
            logMessage += " BID partially_filled\n";
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
            //We bought, need add new size to balance and available
            myAccount.balance[pair.name.split(pair.separator)[0]] += orderDetail.size_filled;
            myAccount.available[pair.name.split(pair.separator)[0]] += orderDetail.size_filled;
            //We bought, need take size from balance. Available was taken when opening buy order
            myAccount.balance[pair.name.split(pair.separator)[1]] -= (orderDetail.size_filled*orderDetail.price);
            //Return rest part of size to available
            myAccount.available[pair.name.split(pair.separator)[1]] += ((orderDetail.size-orderDetail.size_filled)*orderDetail.price);
            break;
        case "SELL":
            logMessage += " ### ASK partially_filled\n";
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

async function processAskOrder(pair, ticker, targetAsk, pendingSellOrder){
    if(targetAsk === 0){
        logMessage += " !!! Skipping process ask order because targetAsk === 0!\n";
        return false;
    } else if (myAccount.available[pair.name.split(pair.separator)[0]] < pendingSellOrder.sell_size) {
        logMessage += " !!! No available " + pair.name.split(pair.separator)[0] + " funds!\n";
        return false;
    } else if (pendingSellOrder.sell_target_price <= targetAsk) {
        logMessage += " ### Let´go open new sell order!\n";
        const createdOrder = await api.createOrder(pair, "SELL", pendingSellOrder, targetAsk);
        apiCounter++;
        if(createdOrder.s){
            myAccount.available[pair.name.split(pair.separator)[0]] -= createdOrder.data.size;
            await db.setOpenedSellerOrder(pair, pendingSellOrder, createdOrder);
            return false;
        } else {
            if(createdOrder.errorMessage.includes("insufficient size") || createdOrder.errorMessage.includes("Filter failure: MIN_NOTIONAL")){
                const failedSellOrder = {"id": pendingSellOrder.buy_id, "status": "insufficient_size"};
                await db.setFailedSellOrder(failedSellOrder);
                logMessage += " !!! Sell order "+pendingSellOrder.buy_id+" finished due to insufficient order size!\n";
            }
            return false;
        }
    } else {
        logMessage += " !!! No sell order for this ask price!\n";
        if(pair.sellOldestOrderWithLoss && pair.bagHolderLimit > 0){
            const resultTotalSellSize = await db.getTotalSellSize(config.name, pair);
            if(resultTotalSellSize >= pair.bagHolderLimit){
                logMessage += " $$$ Sell the oldest order with a loss, if the bag holder limit was reached!\n";
                const forSell = await db.setOldestOrderWithLossForSell(config.name, pair);
                logMessage += JSON.stringify(forSell)+"\n";
            }
        } else if(pair.sellOldestOrderWithLoss && pair.budgetLimit > 0){
            const totalAmount = await tools.getAmountSpent(db, config.name, pair);
            if(totalAmount >= pair.budgetLimit){
                logMessage += " $$$ Sell the oldest order with a loss, if the budget limit was reached!\n";
                const forSell = await db.setOldestOrderWithLossForSell(config.name, pair);
                logMessage += JSON.stringify(forSell)+"\n";
            }
        }
        return false;
    }
}

async function processBidOrder(pair, targetBid){
    if(targetBid === 0){
        logMessage += " !!! Skipping process bid order because targetBid === 0!\n";
        return false;
    } else if (myAccount.available[pair.name.split(pair.separator)[1]] < tools.setPrecisionUp((tools.getBuyOrderSize(pair, targetBid)*targetBid), pair.digitsPrice)){
        logMessage += " !!! No available "+pair.name.split(pair.separator)[1]+" funds!\n";
        return false;
    } else {
        logMessage += " ### Let´go open new buy order!\n";
        const createdOrder = await api.createOrder(pair,"BUY",null, targetBid);
        if(createdOrder.s){
            apiCounter++;
            myAccount.available[pair.name.split(pair.separator)[1]] -= createdOrder.data.funds;
            await db.saveOpenedBuyOrder(config.name, pair, createdOrder);
            return true;
        } else {
            if(!createdOrder.errorMessage.includes("Size order not set in config.")){
                apiCounter++;
            }
            logMessage += " !!! Order not opened!\n";
            logMessage += " !!! " + createdOrder.errorMessage +"\n";
            return false;
        }
    }
}

async function processFinishLoop(apiCounter, pair, type, prevLogMessage, logMessage){
    logMessage += " ### Success finished "+pair.name+" "+pair.id+" "+type+" task, wait: "+(config.sleepPause * apiCounter)+" ms\n";
    logMessage += "//////////////////////////////////////////////////////////////////////////////\n";

    if(config.debug && prevLogMessage !== logMessage){

        /*
        console.log("Prev:\r\n"+prevLogMessage);
        console.log("Actual:\r\n"+logMessage);
        */
        console.log("\r\n"+"///////////////////////////// "+type+" "+pair.name+" "+pair.id+" ////////////////////////////\n"+new Date().toISOString()+"\n"+JSON.stringify(myAccount)+"\n"+logMessage);
        switch(type){
            case "ask":
                lastLogMessage[pair.name+"_"+pair.id].ask = logMessage;
                break;
            case "bid":
                lastLogMessage[pair.name+"_"+pair.id].bid = logMessage;
                break;
        }
    }
    if(apiCounter > 0){
        await tools.sleep(config.sleepPause * apiCounter);
    }
}

module.exports = {
    init: init,
    doAskOrder: doAskOrder,
    doBidOrder: doBidOrder
};
