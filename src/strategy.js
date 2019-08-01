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
        if(!config.pairs[i].active.sell){
            logMessage = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            logMessage += " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" for SELL is disabled.\n";
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
        const resultTicker = await api.getTicker(pair);
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
        if(!config.pairs[i].active.buy){
            logMessage = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            logMessage += " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" for BUY is disabled.\n";
            logMessage += "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
            if(config.debug && lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].bid !== logMessage){
                config.debug && console.log("\r\n"+logMessage);
                lastLogMessage[config.pairs[i].name+"_"+config.pairs[i].id].bid = logMessage;
            }
            //Need throttling for disabled pair to avoid full cpu usage and problem with stopping bot in correct way.
            await tools.sleep(1);
            continue;
        } else if(config.pairs[i].moneyManagement.buyPercentageAvailableBalance.active){
            if (config.pairs[i].moneyManagement.buyPercentageAvailableBalance.budgetLimit > 0 && config.pairs[i].moneyManagement.buyPercentageAvailableBalance.budgetLimit <= await tools.getAmountSpent(db, config.name, config.pairs[i])){
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
        } else if(config.pairs[i].moneyManagement.buyPercentageAvailableBudget.active){
            if (config.pairs[i].moneyManagement.buyPercentageAvailableBudget.budgetLimit > 0 && config.pairs[i].moneyManagement.buyPercentageAvailableBudget.budgetLimit <= await tools.getAmountSpent(db, config.name, config.pairs[i])){
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
        } else if(config.pairs[i].moneyManagement.buyForAmount.active){
            if (config.pairs[i].moneyManagement.buyForAmount.budgetLimit > 0 && config.pairs[i].moneyManagement.buyForAmount.budgetLimit <= await tools.getAmountSpent(db, config.name, config.pairs[i])){
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
        } else if(config.pairs[i].moneyManagement.buySize.active){
            if (config.pairs[i].moneyManagement.buySize.bagHolderLimit > 0 && config.pairs[i].moneyManagement.buySize.bagHolderLimit <= await db.getTotalSellSize(config.name, config.pairs[i]) ){
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
            } else if (config.pairs[i].moneyManagement.buySize.budgetLimit > 0 && config.pairs[i].moneyManagement.buySize.budgetLimit <= await tools.getAmountSpent(db, config.name, config.pairs[i])){
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
        //Get valueForSize by strategy
        let valueForSize = 0;
        if(pair.moneyManagement.autopilot.active){
            const spendAmount = await tools.getAmountSpent(db, config.name, pair);
            //console.log("spendAmount: " + spendAmount);
            const percentageSpendValue = tools.getPercentageValue(spendAmount, pair.moneyManagement.autopilot.budgetLimit, "floor", 2);
            //console.log("percentageSpendValue: " + percentageSpendValue);
            const availableBalance = (pair.moneyManagement.autopilot.budgetLimit-spendAmount);
            //console.log("availableBalance: " + availableBalance);
            let coefficient = 0.1;
            if(percentageSpendValue >= 10 && percentageSpendValue < 25){
                coefficient = percentageSpendValue/100;
            } else if(percentageSpendValue >= 25 && percentageSpendValue < 50){
                coefficient = 0.25;
            } else if (percentageSpendValue >= 50 && percentageSpendValue < 80){
                coefficient = (1-(percentageSpendValue/100))/2;
            }
            //console.log("coefficient: " + coefficient);
            valueForSize = tools.getPercentage(coefficient, availableBalance, pair.digitsPrice);
            //console.log("valueForSize: " + valueForSize);
        } else if(pair.moneyManagement.supportLevel.active){
            const spendAmount = await tools.getAmountSpent(db, config.name, pair);
            const availableBalance = (pair.moneyManagement.supportLevel.budgetLimit-spendAmount);
            valueForSize = availableBalance;
        } else if(pair.moneyManagement.buyPercentageAvailableBudget.active){
            const totalAmount = await tools.getAmountSpent(db, config.name, pair);
            valueForSize = (pair.moneyManagement.buyPercentageAvailableBudget.budgetLimit-totalAmount);
        } else {
            valueForSize = myAccount.available[pair.name.split(pair.separator)[1]];
        }
        //Fetch actual prices from exchange
        const resultTicker = await api.getTicker(pair);
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
                    await processBidOrder(pair, valueForSize, targetBid);
                } else {
                    await processFinishLoop(apiCounter, pair, "bid", lastLogMessage[pair.name+"_"+pair.id].bid, logMessage);
                    return false;
                }
            } else {
                logMessage += " ### We already have opened bid order at " + targetBid + " skipping validateOrder\n";
            }
        } else {
            logMessage += " !!! This will be first opened buy order!\n";
            await processBidOrder(pair, valueForSize, targetBid);
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
    const bidBorderPipsSpreadFromAsk = tools.addPipsToPrice(ticker.bidBorder, pair.moneyManagement.pipsAskBidSpread, pair.digitsPrice);
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
        if(pair.strategy.buySpread.percentage.active){
            bidWithSpread = tools.getPercentageBuySpread(buyOrder.buy_price, pair.strategy.buySpread.percentage.value, pair.digitsPrice);
        } else if(pair.strategy.buySpread.pips.active){
            bidWithSpread = tools.takePipsFromPrice( buyOrder.buy_price, pair.strategy.buySpread.pips.value, pair.digitsPrice);
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
    const askBorderPipsSpreadFromBid = tools.takePipsFromPrice(ticker.askBorder, pair.moneyManagement.pipsAskBidSpread, pair.digitsPrice);
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
                if(pair.strategy.sellOldestOrderWithLossWhenProfit.active && openedOrder.sell_target_price === 0){
                    const sell_target_price = tools.getProfitTargetPrice(openedOrder.buy_price, pair.moneyManagement.percentageProfitTarget, pair.digitsPrice);
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
                const sell_target_price = tools.getProfitTargetPrice(orderDetail.price, pair.moneyManagement.percentageProfitTarget, pair.digitsPrice);
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
                const sell_target_price = tools.getProfitTargetPrice(orderDetail.price, pair.moneyManagement.percentageProfitTarget, pair.digitsPrice);
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
    } else if(pendingSellOrder.sell_size === 0){
        const failedSellOrder = {"id": pendingSellOrder.buy_id, "status": "insufficient_size"};
        await db.setFailedSellOrder(failedSellOrder);
        logMessage += " !!! Sell order "+pendingSellOrder.buy_id+" finished due to insufficient order size!\n";
    } else if (targetAsk >= pendingSellOrder.sell_target_price) {
        //When we hit taker fee on buy order, we can have negative profit. Place sell order only if final profit is bigger than 0
        if(pendingSellOrder.sell_target_price === 0 || tools.calculatePendingProfit(pendingSellOrder, targetAsk) > 0){
            logMessage += " ### Let´go open new sell order!\n";
            const createdOrder = await api.createOrder(pair, "SELL", pendingSellOrder, null, targetAsk);
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
            logMessage += " !!! Canceled, profit is < 0 for pendingSellOrder at current targetAsk!\n";
            logMessage += JSON.stringify(pendingSellOrder)+"\n";
            return false;
        }
    } else {
        logMessage += " !!! No sell order for this ask price!\n";
        if(pair.strategy.sellOldestOrderWithLoss || pair.strategy.sellOldestOrderWithLossWhenProfit.active){
            if(pair.moneyManagement.autopilot.active && pair.moneyManagement.autopilot.budgetLimit > 0){
                const totalAmount = await tools.getAmountSpent(db, config.name, pair);
                if(totalAmount >= pair.moneyManagement.autopilot.budgetLimit){
                    logMessage += " $$$ Sell the oldest order with a loss, if the budget limit was reached!\n";
                    const forSell = await db.setOldestOrderWithLossForSell(config.name, pair);
                    logMessage += JSON.stringify(forSell)+"\n";
                } else if(pair.strategy.sellOldestOrderWithLossWhenProfit.active){
                    await sellOldestOrderWithLossWhenProfit(config.name, pair, targetAsk);
                }
            } else if(pair.moneyManagement.buyPercentageAvailableBalance.active && pair.moneyManagement.buyPercentageAvailableBalance.budgetLimit > 0){
                const totalAmount = await tools.getAmountSpent(db, config.name, pair);
                if(totalAmount >= pair.moneyManagement.buyPercentageAvailableBalance.budgetLimit){
                    logMessage += " $$$ Sell the oldest order with a loss, if the budget limit was reached!\n";
                    const forSell = await db.setOldestOrderWithLossForSell(config.name, pair);
                    logMessage += JSON.stringify(forSell)+"\n";
                } else if(pair.strategy.sellOldestOrderWithLossWhenProfit.active){
                    await sellOldestOrderWithLossWhenProfit(config.name, pair, targetAsk);
                }
            } else if(pair.moneyManagement.buyPercentageAvailableBudget.active && pair.moneyManagement.buyPercentageAvailableBudget.budgetLimit > 0){
                const totalAmount = await tools.getAmountSpent(db, config.name, pair);
                if(totalAmount >= pair.moneyManagement.buyPercentageAvailableBudget.budgetLimit){
                    logMessage += " $$$ Sell the oldest order with a loss, if the budget limit was reached!\n";
                    const forSell = await db.setOldestOrderWithLossForSell(config.name, pair);
                    logMessage += JSON.stringify(forSell)+"\n";
                } else if(pair.strategy.sellOldestOrderWithLossWhenProfit.active){
                    await sellOldestOrderWithLossWhenProfit(config.name, pair, targetAsk);
                }
            } else if(pair.moneyManagement.buyForAmount.active && pair.moneyManagement.buyForAmount.budgetLimit > 0){
                const totalAmount = await tools.getAmountSpent(db, config.name, pair);
                if(totalAmount >= pair.moneyManagement.buyForAmount.budgetLimit){
                    logMessage += " $$$ Sell the oldest order with a loss, if the budget limit was reached!\n";
                    const forSell = await db.setOldestOrderWithLossForSell(config.name, pair);
                    logMessage += JSON.stringify(forSell)+"\n";
                } else if(pair.strategy.sellOldestOrderWithLossWhenProfit.active){
                    await sellOldestOrderWithLossWhenProfit(config.name, pair, targetAsk);
                }
            } else if(pair.moneyManagement.buySize.active && pair.moneyManagement.buySize.bagHolderLimit > 0){
                const resultTotalSellSize = await db.getTotalSellSize(config.name, pair);
                if(resultTotalSellSize >= pair.moneyManagement.buySize.bagHolderLimit){
                    logMessage += " $$$ Sell the oldest order with a loss, if the bag holder (total size) limit was reached!\n";
                    const forSell = await db.setOldestOrderWithLossForSell(config.name, pair);
                    logMessage += JSON.stringify(forSell)+"\n";
                } else if(pair.strategy.sellOldestOrderWithLossWhenProfit.active){
                    await sellOldestOrderWithLossWhenProfit(config.name, pair, targetAsk);
                }
            } else if(pair.moneyManagement.buySize.active && pair.moneyManagement.buySize.budgetLimit > 0){
                const totalAmount = await tools.getAmountSpent(db, config.name, pair);
                if(totalAmount >= pair.moneyManagement.buySize.budgetLimit){
                    logMessage += " $$$ Sell the oldest order with a loss, if the budget limit was reached!\n";
                    const forSell = await db.setOldestOrderWithLossForSell(config.name, pair);
                    logMessage += JSON.stringify(forSell)+"\n";
                } else if(pair.strategy.sellOldestOrderWithLossWhenProfit.active){
                    await sellOldestOrderWithLossWhenProfit(config.name, pair, targetAsk);
                }
            }
        }
        return false;
    }
}

async function sellOldestOrderWithLossWhenProfit(config_name, pair, targetAsk){
    const totalPositiveProfit = await db.getPositiveProfit(config_name, pair);
    //console.error("totalPositiveProfit: " + totalPositiveProfit);
    const totalProfitForLosses = tools.getPercentage((100 - pair.strategy.sellOldestOrderWithLossWhenProfit.keepPercentageOfProfit), totalPositiveProfit, pair.digitsPrice) ;
    //console.error("totalProfitForLosses: " + totalProfitForLosses);
    const totalNegativeProfit = await db.getNegativeProfit(config_name, pair);
    //console.error("totalNegativeProfit: " + totalNegativeProfit);
    const availableProfitForLosses = totalProfitForLosses - Math.abs(totalNegativeProfit);
    //console.error("availableProfitForLosses: " + availableProfitForLosses);

    const oldestOrder = await db.getOldestPendingSellOrder(config_name, pair);
    const pl = tools.calculatePendingProfit(oldestOrder, targetAsk);
    if(pl < 0) {
        //console.error("pl: " + pl);
        if ((availableProfitForLosses - Math.abs(pl)) > 0) {
            await db.setSellTargetPrice(config_name, pair, oldestOrder.buy_id, 0);
        }
    }
}

async function processBidOrder(pair, valueForSize, targetBid){
    if(targetBid === 0){
        logMessage += " !!! Skipping process bid order because targetBid === 0!\n";
        return false;
    } else if (myAccount.available[pair.name.split(pair.separator)[1]] < pair.minSize*targetBid){
        logMessage += " !!! No available "+pair.name.split(pair.separator)[1]+" funds!\n";
        return false;
    } else {
        logMessage += " ### Let´go open new buy order!\n";
        const createdOrder = await api.createOrder(pair,"BUY",null, valueForSize, targetBid);
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
