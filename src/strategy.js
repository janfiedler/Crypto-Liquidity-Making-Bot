const tools = require('../src/tools');
const email = require('../src/email');

let config;
let myAccount;
let db;
let api;
let apiCounter = 0;
let logMessage;
let lastLogMessage = [];
let lastTickers = {};
const exclamationMarks = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";

let init = function (configuration, balance, database, apiExchange){
    config = configuration;
    myAccount = balance;
    db = database;
    api = apiExchange;


    for(let i=0;i<config.pairs.length;i++){
        let pair = config.pairs[i];
        lastLogMessage[pair.name+"_"+pair.id] = {"ask": "", "bid": ""};
        lastTickers[pair.name+"_"+pair.id] = {"ask": "", "askBorder": 0, "bid": "", "bidBorder": 0, "timestamp": {"ask": Date.now(), "bid": Date.now()} };
    }
};

let doAskOrder = async function(){
    let tickers = {};
    // Parse all currency pair in config and check if is available balance for sell trade
    for(let i=0;i<config.pairs.length;i++){
        if(!config.pairs[i].active.sell){
            logMessage = exclamationMarks + " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" for SELL is disabled.\n" + exclamationMarks;
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
        //let sellingForCurrency = pair.name.split(pair.separator)[1];
        //let sellingCurrency = pair.name.split(pair.separator)[0];

        //Get lowest pending sell order
        const pendingSellOrder = await db.getLowestSellTargetPrice(config.name, pair);
        if(!pendingSellOrder){
            logMessage += " ### PendingSellOrder not found, skipp the loop.\n";
            //For case when all pendingSellOrders are frozen. lastTickers is used to get price from doBuy, if budget limit is not reached.
            process.send({
                "type": "ticker",
                "exchange": config.name,
                "pair": pair,
                "tick": {"ask": lastTickers[pair.name+"_"+pair.id].askBorder, "bid": lastTickers[pair.name+"_"+pair.id].bidBorder}
            });
            //Need throttling for disabled pair to avoid full cpu usage and problem with stopping bot in correct way.
            await tools.sleep(1);
            //Nothing to sell, skip the loop.
            continue;
        }
        // Check for actual opened sell order
        const resultOpenedSellOrder = await db.getOpenedSellOrder(config.name, pair);
        //Fetch actual prices from exchange
        const resultTicker = await api.getTicker(pair);
        if(resultTicker.counter){
            apiCounter++;
        }
        //Parse fetched data to json object.
        if(resultTicker.s){
            tickers[pair.name] = await api.parseTicker("ask", resultTicker.data, pair, resultOpenedSellOrder);
            //Performance optimization, process only if orders book change
            //If last lastTickers is older than 10 minutes
            if ((Date.now() - lastTickers[pair.name+"_"+pair.id].timestamp.ask) > 600000 || JSON.stringify(lastTickers[pair.name+"_"+pair.id].ask) !== JSON.stringify(tickers[pair.name].ask)) {
                //Performance optimization, send ask/bid price only when is different
                if (lastTickers[pair.name+"_"+pair.id].askBorder !== tickers[pair.name].askBorder) {
                    process.send({
                        "type": "ticker",
                        "exchange": config.name,
                        "pair": pair,
                        "tick": {"ask": tickers[pair.name].askBorder, "bid": tickers[pair.name].bidBorder}
                    });
                }
                lastTickers[pair.name+"_"+pair.id].ask = tickers[pair.name].ask;
                lastTickers[pair.name+"_"+pair.id].askBorder = tickers[pair.name].askBorder;
                lastTickers[pair.name+"_"+pair.id].timestamp.ask = Date.now();
            } else {
                logMessage += " !!! Price didn't change, skip the loop.\n";
                await processFinishLoop(apiCounter, pair, "ask", lastLogMessage[pair.name+"_"+pair.id].ask, logMessage);
                continue;
            }
        } else {
            //Return false will skip ask process and start bid process.
            return false;
        }

        if(tickers[pair.name].ask.length === 0){
            logMessage += " !!! ASK order book not match with ignoreOrderSize !!!\n";
            //Return false will skip ask process and start bid process.
            return false;
        }

        let targetAsk = await findSpotForAskOrder(pendingSellOrder, tickers[pair.name] , pair);
        if((!pair.active.sellRange.active) || (pair.active.sellRange.active && targetAsk >= pair.active.sellRange.from &&  targetAsk <= pair.active.sellRange.to)){
            if(typeof resultOpenedSellOrder !== 'undefined' && resultOpenedSellOrder){
                logMessage += " ### Found opened sell order " + resultOpenedSellOrder.sell_id + "\n";
                const sellTimeBetween = tools.getTimeBetween(resultOpenedSellOrder.sell_created, new Date().toISOString());
                //If targetAsk dont change after ten minutes, force validate order.
                if(targetAsk !== resultOpenedSellOrder.sell_price || sellTimeBetween.minutes >= config.validateTimeout){
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
                    logMessage += " ### " + JSON.stringify(sellTimeBetween)+"\n";
                }
            } else {
                logMessage += " !!! This will be first opened sell order!\n";
                await processAskOrder(pair, tickers[pair.name], targetAsk, pendingSellOrder);
            }
        } else {
            logMessage += " !!! Target Ask at " + targetAsk + " is outside sellRange "+pair.active.sellRange.from+"-"+pair.active.sellRange.to+" !!!\n";
        }
        await processFinishLoop(apiCounter, pair, "ask", lastLogMessage[pair.name+"_"+pair.id].ask, logMessage);
    }
    return true;
};

let doBidOrder = async function (){
    let tickers = {};
    // Parse all currency pair in config and check if is available balance for buy trade
    for(let i=0;i<config.pairs.length;i++){
        let skipDoBidOrder = false;
        let logMessageDetail;
        if(!config.pairs[i].active.buy){
            logMessageDetail = " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" for BUY is disabled.\n";
            skipDoBidOrder = true;
        } else {
            let totalSellSize = 0;
            let totalAmountSpent = 0;
            if(config.pairs[i].moneyManagement.buySize.active){
                totalSellSize = await db.getTotalSellSize(config.name, config.pairs[i]);
                totalAmountSpent = await tools.getAmountSpent(db, config.name, config.pairs[i]);
                if (config.pairs[i].moneyManagement.buySize.bagHolderLimit > 0 && config.pairs[i].moneyManagement.buySize.bagHolderLimit <= totalSellSize){
                    logMessageDetail = " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" reached maximum bag holder limit "+totalSellSize+". We do not need to buy more.\n";
                    skipDoBidOrder = true;
                } else if (config.pairs[i].moneyManagement.buySize.budgetLimit > 0 && config.pairs[i].moneyManagement.buySize.budgetLimit <= totalAmountSpent){
                    logMessageDetail = " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" reached maximum budget limit "+totalAmountSpent+". We do not need to buy more.\n";
                    skipDoBidOrder = true;
                } else if(config.pairs[i].moneyManagement.buySize.value < config.pairs[i].minTradeAmount){
                    logMessageDetail = " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" !!! buySizeValue < minTradeAmount !!!\n";
                    skipDoBidOrder = true;
                }
            } else {
                totalAmountSpent = await tools.getAmountSpent(db, config.name, config.pairs[i]);
                logMessageDetail = " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" reached maximum budget limit "+totalAmountSpent+". We do not need to buy more.\n";
                if(config.pairs[i].moneyManagement.autopilot.active){
                    if (config.pairs[i].moneyManagement.autopilot.budgetLimit > 0 && config.pairs[i].moneyManagement.autopilot.budgetLimit <= totalAmountSpent){
                        skipDoBidOrder = true;
                    }
                } else if(config.pairs[i].moneyManagement.supportLevel.active){
                    if (config.pairs[i].moneyManagement.supportLevel.budgetLimit > 0 && config.pairs[i].moneyManagement.supportLevel.budgetLimit <= totalAmountSpent){
                        skipDoBidOrder = true;
                    }
                } else if(config.pairs[i].moneyManagement.buyPercentageAvailableBalance.active){
                    if (config.pairs[i].moneyManagement.buyPercentageAvailableBalance.budgetLimit > 0 && config.pairs[i].moneyManagement.buyPercentageAvailableBalance.budgetLimit <= totalAmountSpent){
                        skipDoBidOrder = true;
                    }
                } else if(config.pairs[i].moneyManagement.buyPercentageAvailableBudget.active){
                    if (config.pairs[i].moneyManagement.buyPercentageAvailableBudget.budgetLimit > 0 && config.pairs[i].moneyManagement.buyPercentageAvailableBudget.budgetLimit <= totalAmountSpent){
                        skipDoBidOrder = true;
                    }
                } else if(config.pairs[i].moneyManagement.buyForAmount.active){
                    if(config.pairs[i].moneyManagement.buyForAmount.value < config.pairs[i].minSpendAmount){
                        logMessageDetail = " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" !!! buyForAmount < minSpendAmount !!!\n";
                        skipDoBidOrder = true;
                    } else if (config.pairs[i].moneyManagement.buyForAmount.budgetLimit > 0 && config.pairs[i].moneyManagement.buyForAmount.budgetLimit <= totalAmountSpent){
                        skipDoBidOrder = true;
                    } else if(!config.pairs[i].active.margin && !config.pairs[i].strategy.buySpread.buyForHigherPrice && myAccount.available[config.pairs[i].name.split(config.pairs[i].separator)[1]] < config.pairs[i].moneyManagement.buyForAmount.value){
                        logMessageDetail = " ### Pair "+ config.pairs[i].name +" #"+ config.pairs[i].id +" !!! No available "+config.pairs[i].name.split(config.pairs[i].separator)[1]+" funds!\n";
                        skipDoBidOrder = true;
                    }
                }
            }
        }
        if(skipDoBidOrder){
            logMessage = exclamationMarks + logMessageDetail + exclamationMarks;
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
        logMessage = " ### Lets process bid for "+ pair.name+" #"+pair.id+" in the loop.\n";
        //let buyForCurrency = pair.name.split(pair.separator)[1];
        //let buyCurrency = pair.name.split(pair.separator)[0];

        //Get lowest already filled buy order = pending sell order
        const lowestFilledBuyOrder = await db.getFilledBuyOrder(config.name, pair, "ASC");
        //Get highest already filled buy order = pending sell order
        const highestFilledBuyOrder = await db.getFilledBuyOrder(config.name, pair, "DESC");
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
        } else if(pair.active.margin && pair.moneyManagement.buyForAmount.active){
            //For buy is allowed funding with margin

            //Get total spent amount
            let spentAmount = await tools.getAmountSpent(db, config.name, pair);
            spentAmount = tools.setPrecision(spentAmount , pair.digitsPrice);
            console.error("spentAmount: " + spentAmount);
            //Get total borrowed amount
            //!!!! handle first run when no row in db
            const borrowed = await db.getFunding(config.name, pair);
            const borrowedAmount = borrowed.amount;
            //console.error("borrowedAmount: "+borrowedAmount);
            //Set what amount will be spend in next order
            const spendAmount = pair.moneyManagement.buyForAmount.value;

            if( (spentAmount+spendAmount) > borrowedAmount){
                //Need more amount then we have, let´s borrow
                let borrowAmount =  tools.setPrecisionUp( (spentAmount+spendAmount) - borrowedAmount , 8);
                //Borrow 10% more of spendAmount to cover real amount needed based on future opening price, we will return rest if needed in next loop.
                borrowAmount = borrowAmount+(spendAmount/10);
                console.error("borrowAmount: " + borrowAmount);
                if(borrowAmount > 0){
                    //Check if we need borrow or we have free capital
                    let marginDetail = await api.accountMarginDetail();
                    if(!marginDetail.s){
                        apiCounter++;
                        await email.sendEmail("API Error accountMarginDetail ", pair.name +" #"+ pair.id +" need manual validate accountMarginDetail: " + JSON.stringify(marginDetail));
                        logMessage += " !!! EMERGENCY ERROR happened! Validate orders!\n";
                        if(config.stopTradingOnError){
                            await tools.sleep(999999999);
                            return false;
                        } else {
                            return false;
                        }
                    }
                    //console.error(JSON.stringify(marginDetail));
                    //Find correct asset for actual trade what we want borrow
                    const marginPairDetail = marginDetail.data.userAssets.find(o => o.asset === pair.name.split(pair.separator)[1]);

                    if(marginPairDetail.free < borrowAmount && marginDetail.data.marginLevel > 2){
                        //Round number how much we need borrow
                        const weNeedBorrow = tools.setPrecision((borrowAmount-marginPairDetail.free) , 8);
                        //Request borrow funding with margin if we have marginLevel > 2 so we  have chance transfer funds.
                        const marginBorrowId = await api.marginBorrow(config.name, pair,  weNeedBorrow);
                        if(!marginBorrowId.s){
                            apiCounter++;
                            await email.sendEmail("API Error accountTransferId ", pair.name +" #"+ pair.id +" need manual validate accountTransferId: " + JSON.stringify(accountTransferId));
                            logMessage += " !!! EMERGENCY ERROR happened! Validate orders!\n";
                            if(config.stopTradingOnError){
                                await tools.sleep(999999999);
                                return false;
                            } else {
                                return false;
                            }
                        }
                        if(marginBorrowId.data > 0){
                            //Save margin borrow funding to history
                            await db.saveFundingHistory(config.name, pair, weNeedBorrow, "borrow", marginBorrowId.data);
                            //Update actual marginDetail after borrow funds
                            marginDetail = await api.accountMarginDetail();
                            if(!marginDetail.s){
                                apiCounter++;
                                await email.sendEmail("API Error accountMarginDetail ", pair.name +" #"+ pair.id +" need manual validate accountMarginDetail: " + JSON.stringify(marginDetail));
                                logMessage += " !!! EMERGENCY ERROR happened! Validate orders!\n";
                                if(config.stopTradingOnError){
                                    await tools.sleep(999999999);
                                    return false;
                                } else {
                                    return false;
                                }
                            }
                        }
                        console.error("### We need borrow " + weNeedBorrow + " from " + borrowAmount);
                        apiCounter += 3;
                    } else if (marginPairDetail.free >= borrowAmount){
                        console.error("### We have own " + borrowAmount + " from " + marginPairDetail.free);
                        //We dont need to buy, just transfer our free capital
                        apiCounter += 2;
                    }

                    //Check if margin level > 2, than can we transfer and use for trading
                    if(marginDetail.data.marginLevel > 2){
                        //Transfer our or borrowed capital from margin account to spot account
                        const accountTransferId = await api.accountTransfer(config.name, pair, borrowAmount , "fromMargin");
                        apiCounter++;
                        if(!accountTransferId.s){
                            apiCounter++;
                            await email.sendEmail("API Error accountTransferId ", pair.name +" #"+ pair.id +" need manual validate accountTransferId: " + JSON.stringify(accountTransferId));
                            logMessage += " !!! EMERGENCY ERROR happened! Validate orders!\n";
                            if(config.stopTradingOnError){
                                await tools.sleep(999999999);
                                return false;
                            } else {
                                return false;
                            }
                        }
                        //Update balance and available on margin borrow success
                        myAccount.balance[pair.name.split(pair.separator)[1]] += borrowAmount;
                        myAccount.available[pair.name.split(pair.separator)[1]] += borrowAmount;
                        //Save fund transfer to history
                        await db.saveFundTransferHistory(config.name, pair, borrowAmount, "fromMargin", accountTransferId.data);
                        //Update actual state of funding (from own or exchange) for current pair to database
                        await db.updateFunding(config.name, pair, borrowAmount, "borrow");
                        //Up-to x api calls was made, add to counter
                    } else {
                        await email.sendEmail("Binance Margin level < 2", pair.name +" #"+ pair.id +" margin level < 2: " + JSON.stringify(marginDetail));
                        await tools.sleep(999999999);
                    }
                }
            } else if ((spentAmount+spendAmount) < borrowedAmount){
                let leftToRepay = tools.setPrecision(borrowedAmount-(spentAmount+spendAmount), 8);
                if(leftToRepay > 0){
                    console.log(pair.name +" #"+ pair.id +" ("+spentAmount+"+"+spendAmount+") < "+borrowedAmount+" We need to do some more repay: "+ leftToRepay);
                    await processMarginRepay(leftToRepay, pair, null);
                }
            }
            valueForSize = myAccount.available[pair.name.split(pair.separator)[1]];
        } else {
            valueForSize = myAccount.available[pair.name.split(pair.separator)[1]];
        }
        //Fetch actual prices from exchange
        const resultTicker = await api.getTicker(pair);
        if(resultTicker.counter){
            apiCounter++;
        }
        //Parse fetched data to json object.
        if(resultTicker.s && resultTicker.data){
            tickers[pair.name] = await api.parseTicker("bid", resultTicker.data, pair, resultOpenedBuyOrder);
            //Performance optimization, process only if orders book change
            if ((Date.now() - lastTickers[pair.name+"_"+pair.id].timestamp.bid) > 600000 || JSON.stringify(lastTickers[pair.name+"_"+pair.id].bid) !== JSON.stringify(tickers[pair.name].bid)) {
                //Performance optimization, send ask/bid price only when is different
                if (lastTickers[pair.name+"_"+pair.id].bidBorder !== tickers[pair.name].bidBorder) {
                    process.send({
                        "type": "ticker",
                        "exchange": config.name,
                        "pair": pair,
                        "tick": {"ask": tickers[pair.name].askBorder, "bid": tickers[pair.name].bidBorder}
                    });
                }
                lastTickers[pair.name+"_"+pair.id].bid = tickers[pair.name].bid;
                lastTickers[pair.name+"_"+pair.id].bidBorder = tickers[pair.name].bidBorder;
                lastTickers[pair.name+"_"+pair.id].timestamp.bid = Date.now();
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

        if(tickers[pair.name].bid.length === 0){
            logMessage += " !!! BID order book not match with ignoreOrderSize !!!\n";
            //Return false will skip ask process and start bid process.
            return false;
        }

        let targetBid;
        if(pair.strategy.buySpread.buyForHigherPrice && lowestFilledBuyOrder && highestFilledBuyOrder){
            //Get highest already filled buy order = pending sell order
            targetBid = await findSpotForBidOrder("bothDirection", {l:lowestFilledBuyOrder, h:highestFilledBuyOrder}, tickers[pair.name] , pair);
        } else if(lowestFilledBuyOrder){
            targetBid = await findSpotForBidOrder("lowestOrder", {l:lowestFilledBuyOrder, h:null}, tickers[pair.name] , pair);
        } else if(resultOpenedBuyOrder){
            targetBid = await findSpotForBidOrder("openedOrder", {l:resultOpenedBuyOrder, h:null}, tickers[pair.name] , pair);
        } else {
            targetBid = await findSpotForBidOrder("firstOrder", null, tickers[pair.name] , pair);
        }

        if((!pair.active.buyRange.active) || (pair.active.buyRange.active && targetBid >= pair.active.buyRange.from &&  targetBid <= pair.active.buyRange.to)){
            if(typeof resultOpenedBuyOrder !== 'undefined' && resultOpenedBuyOrder){
                logMessage += " ### Found opened bid order " + resultOpenedBuyOrder.buy_id+"\n";

                const buyTimeBetween = tools.getTimeBetween(resultOpenedBuyOrder.buy_created, new Date().toISOString());
                //If targetBid dont change after ten minutes, force validate order.
                if(targetBid !== resultOpenedBuyOrder.buy_price || buyTimeBetween.minutes >= config.validateTimeout) {
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
                    logMessage += " ### " + JSON.stringify(buyTimeBetween)+"\n";
                }
            } else {
                logMessage += " !!! This will be first opened buy order!\n";
                await processBidOrder(pair, valueForSize, targetBid);
            }
        } else {
            logMessage += " !!! Target Bid at " + targetBid + " is outside buyRange "+pair.active.buyRange.from+"-"+pair.active.buyRange.to+" !!!\n";
        }

        await processFinishLoop(apiCounter, pair, "bid", lastLogMessage[pair.name+"_"+pair.id].bid, logMessage);
    }
    return true;
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
                logMessage += " ### "+ticker.ask[i].price + " is my target price with size: " + ticker.ask[i].size+"\n";
                targetAsk = ticker.ask[i].price;
                break;
            }
        }
    }
    targetAsk = tools.takePipsFromPrice(targetAsk, 1, pair.digitsPrice);

    if(pair.moneyManagement.roundPriceToPips.active){
        targetAsk = parseFloat((Math.floor(targetAsk * (100/pair.moneyManagement.roundPriceToPips.value)) / (100/pair.moneyManagement.roundPriceToPips.value)).toFixed(pair.digitsPrice));
    }
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

let findSpotForBidOrder = async function (orderType, buyOrder, ticker, pair){
    const keysCount = Object.keys(ticker.bid).length;
    let targetBid = ticker.bid[0].price;

    // Find targetBid following big orders if is allowed
    if(config.stickToBigOrders){
        for(let i=0;i<keysCount;i++){
            if ((i+2) >= keysCount){
                break
            }
            if(ticker.bid[i].size > (ticker.bid[(i+1)].size+ticker.bid[(i+2)].size) && ticker.bid[i].size > buyOrder.l.buy_size){
                logMessage += " ### "+ticker.bid[i].price + " is my target price with size: " + ticker.bid[i].size+"\n";
                targetBid = ticker.bid[i].price;
                break;
            }
        }
    }

    targetBid = tools.addPipsToPrice(targetBid, 1, pair.digitsPrice);
    // This is for itbit exchange where is smallest price change per 0.25 USD on bitcoin
    if(pair.moneyManagement.roundPriceToPips.active){
        targetBid = Math.ceil(targetBid * (100/pair.moneyManagement.roundPriceToPips.value)) / (100/pair.moneyManagement.roundPriceToPips.value);
    }

    //Choose if is time buy cheaper or for higher price
    if(orderType === "bothDirection"){
        if(targetBid > buyOrder.h.buy_price){
            let higherBidWithSpread;
            if(pair.strategy.buySpread.percentage.active){
                higherBidWithSpread = tools.getProfitTargetPrice(buyOrder.h.buy_price, pair.strategy.buySpread.percentage.value, pair.digitsPrice);
            } else if(pair.strategy.buySpread.pips.active){
                higherBidWithSpread = tools.addPipsToPrice( buyOrder.h.buy_price, pair.strategy.buySpread.pips.value, pair.digitsPrice);
            }
            //Validate if new target ask is not close to bid order or taking bid order.
            const askBorderPipsSpreadFromBid = tools.takePipsFromPrice(ticker.askBorder, pair.moneyManagement.pipsAskBidSpread, pair.digitsPrice);
            if(higherBidWithSpread > askBorderPipsSpreadFromBid) {
                logMessage += " ### New higher target bid "+higherBidWithSpread+" is in danger zone of ask border "+ticker.askBorder+". Target bid = orderType => lowestOrder \n";
                orderType = "lowestOrder";
            } else if (targetBid > higherBidWithSpread) {
                logMessage += " ### targetBid: " + targetBid+"\n";
                return targetBid;
            } else {
                //Price is higher, but not enough for buy spread
                orderType = "lowestOrder";
            }
        } else if (targetBid < buyOrder.l.buy_price){
            orderType = "lowestOrder";
        } else if (targetBid <= buyOrder.h.buy_price && targetBid >= buyOrder.l.buy_price){
            //If targetBid is in middle ob hi and low buy_price akt like with lowestOrder
            orderType = "lowestOrder";
        }

    }

    //Validate if targetBid have pips spread between previous lowest filled buy order. (DO NOT BUY for higher price, until this buy order is sold)
    if(orderType === "lowestOrder"){
        let bidWithSpread;
        if(pair.strategy.buySpread.percentage.active){
            bidWithSpread = tools.getPercentageBuySpread(buyOrder.l.buy_price, pair.strategy.buySpread.percentage.value, pair.digitsPrice);
        } else if(pair.strategy.buySpread.pips.active){
            bidWithSpread = tools.takePipsFromPrice( buyOrder.l.buy_price, pair.strategy.buySpread.pips.value, pair.digitsPrice);
        }

        //Validate if target price is lower than last filled buy order
        if(targetBid > bidWithSpread){
            logMessage += " ### Target bid " +targetBid+" is higher than previous filled buy order with spread "+bidWithSpread+" !\n";
            targetBid = bidWithSpread;
            for(let i=0;i<keysCount;i++){
                if(ticker.bid[i].price < bidWithSpread){
                    targetBid = tools.addPipsToPrice(ticker.bid[i].price, 1, pair.digitsPrice);
                    break;
                }
            }
            // This is for itbit exchange where is smallest price change per 0.25 USD on bitcoin
            if(pair.moneyManagement.roundPriceToPips.active){
                //targetBid = parseFloat((Math.ceil(targetBid * (100/pair.moneyManagement.roundPriceToPips.value)) / (100/pair.moneyManagement.roundPriceToPips.value)).toFixed(pair.digitsPrice));
                targetBid = Math.ceil(targetBid * (100/pair.moneyManagement.roundPriceToPips.value)) / (100/pair.moneyManagement.roundPriceToPips.value);
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
    apiCounter += canceledOrder.counter;
    if (canceledOrder.s){
        logMessage += " ### orderDetail = api.cancelOrder(id)\n";
        orderDetail = canceledOrder.data;
    } else {
        if(canceledOrder.data.error.includes("emergency stop")){
            await email.sendEmail("API EMERGENCY STOP - createOrder validateOrder", pair.name +" #"+ pair.id +" need manual validate last cancelOrder: " + JSON.stringify(canceledOrder)+"\n"+JSON.stringify(openedOrder));
            await tools.sleep(999999999);
        } else if(canceledOrder.data.error.includes('not found')){
            //Order was probably canceled manually, sync local DB
            const detailOrder = await api.getOrder(pair, id, type, openedOrder);
            apiCounter += detailOrder.counter;
            if(detailOrder.s) {
                logMessage += " ### orderDetail = api.getOrder(id)\n";
                orderDetail = detailOrder.data;
            } else {
                if(detailOrder.data.error.includes("emergency stop")){
                    await email.sendEmail("API EMERGENCY STOP - validateOrder", pair.name +" #"+ pair.id +" need manual validate getOrder: " + JSON.stringify(detailOrder) +"\n"+JSON.stringify(openedOrder));
                    await tools.sleep(999999999);
                } else if(detailOrder.data.error.includes("repeat")){
                    logMessage += " !!! validateOrder Repeat order due to\n "+detailOrder.data.reason+"!\n";
                    return false;
                } else {
                    await email.sendEmail("API Timeout getOrder "+type, pair.name +" #"+ pair.id +" need manual validate last orders: " + JSON.stringify(detailOrder));
                    logMessage += " !!! EMERGENCY ERROR happened! Validate orders!\n";
                    if(config.stopTradingOnError){
                        await tools.sleep(999999999);
                    } else {
                        return false;
                    }
                }
            }
        } else if(canceledOrder.data.error.includes('has wrong status.')){
            //Coinfalcon used to respond with this message if the order was not open anymore (fully filled or already cancelled). However they also respond with this (rarely) when the order is still actually open.
            logMessage += " !!! Catched cancelOrder has wrong status\n";
            return false;
        } else if(canceledOrder.data.error.includes("repeat")){
            logMessage += " !!! validateOrder Repeat order due to:\n "+canceledOrder.data.reason+"!\n";
            return false;
        } else {
            await email.sendEmail("API Timeout validateOrder/cancelOrder", pair.name +" #"+ pair.id +" need manual validate last orders: " + JSON.stringify(canceledOrder));
            logMessage += " !!! EMERGENCY cancelOrder ERROR happened! Validate orders!\n";
            if(config.stopTradingOnError){
                await tools.sleep(999999999);
            } else {
                return false;
            }
        }
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
                    let sell_target_price;
                    if(pair.strategy.profitTarget.percentage.active){
                        sell_target_price = tools.getProfitTargetPrice(openedOrder.buy_price, pair.strategy.profitTarget.percentage.value, pair.digitsPrice);
                    } else if(pair.strategy.profitTarget.pips.active){
                        sell_target_price = tools.addPipsToPrice(openedOrder.buy_price, pair.strategy.profitTarget.pips.value, pair.digitsPrice);
                    }
                    logMessage += " $$$ Set again profit target: " + sell_target_price + " \n";
                    logMessage += JSON.stringify(openedOrder)+"\n";
                    await db.setSellTargetPrice(config.name, pair, openedOrder.buy_id, sell_target_price);
                }
                break;
        }
        return true;
    } else if(orderDetail.size_filled === orderDetail.size){
        // Order was fulfilled
        await processFulfilledOrder(pair, orderDetail);
        switch(orderDetail.type){
            case "BUY":
                let sell_target_price;
                if(pair.strategy.profitTarget.percentage.active){
                    sell_target_price = tools.getProfitTargetPrice(orderDetail.price, pair.strategy.profitTarget.percentage.value, pair.digitsPrice);
                } else if(pair.strategy.profitTarget.pips.active){
                    sell_target_price = tools.addPipsToPrice(orderDetail.price, pair.strategy.profitTarget.pips.value, pair.digitsPrice);
                }
                process.send({
                    "type": "filledBuyOrder",
                    "exchange": config.name,
                    "pair": pair,
                    "order": orderDetail,
                    "sellTargetPrice": sell_target_price
                });
                await db.setPendingSellOrder(orderDetail, sell_target_price);
                break;
            case "SELL":
                await db.setCompletedSellOrder(orderDetail);
                await processCalculateProfit(pair, orderDetail);
                //Check if for order was used margin funding. If yes, repay amount
                if(pair.active.margin){
                    await processMarginRepay(0, pair, orderDetail);
                }
                break;
        }
        return false;
    } else if(orderDetail.size_filled < orderDetail.size){
        // Order was partially_filled
        await processPartiallyFilled(pair, orderDetail);
        switch(orderDetail.type){
            case "BUY":
                let sell_target_price;
                if(pair.strategy.profitTarget.percentage.active){
                    sell_target_price = tools.getProfitTargetPrice(orderDetail.price, pair.strategy.profitTarget.percentage.value, pair.digitsPrice);
                } else if(pair.strategy.profitTarget.pips.active){
                    sell_target_price = tools.addPipsToPrice(orderDetail.price, pair.strategy.profitTarget.pips.value, pair.digitsPrice);
                }
                process.send({
                    "type": "filledBuyOrder",
                    "exchange": config.name,
                    "pair": pair,
                    "order": orderDetail,
                    "sellTargetPrice": sell_target_price
                });
                await db.setPendingSellOrder(orderDetail, sell_target_price);
                break;
            case "SELL":
                await db.setCompletedSellOrder(orderDetail);
                await db.reOpenPartFilledSellOrder(config.name, pair, openedOrder, (orderDetail.size-orderDetail.size_filled));
                await processCalculateProfit(pair, orderDetail);
                //Check if for order was used margin funding. If yes, repay amount
                if(pair.active.margin){
                    await processMarginRepay(0, pair, orderDetail);
                }
                break;
        }
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

let processMarginRepay = async function(repayAmount, pair, orderDetail){
    if(repayAmount === 0) {
        const completedOrder = await db.getCompletedOrder(orderDetail.id);
        //If order has profit, repay only based on buy_price. If negative, based on sell_price.
        if (completedOrder.profit > 0) {
            //We cam repay more with rond up, because we are in profit
            repayAmount = tools.setPrecisionUp((completedOrder.buy_price * completedOrder.sell_filled), 8);
        } else {
            repayAmount = tools.setPrecisionDown((completedOrder.sell_price * completedOrder.sell_filled), 8);
        }
        console.error("### calculatedRepayAmount: " + repayAmount);
    }
    if(repayAmount > 0){
        //Check if we have available fund on spot account for repay margin funding
        if( (myAccount.available[pair.name.split(pair.separator)[1]]-repayAmount) >= 0){
            //First we need transfer fund from spot to margin account to be repaid
            const accountTransferId = await api.accountTransfer(config.name, pair, repayAmount , "fromSpot");
            if(!accountTransferId.s){
                apiCounter++;
                await email.sendEmail("API Error accountTransferId ", pair.name +" #"+ pair.id +" need manual validate accountTransferId: " + JSON.stringify(accountTransferId));
                logMessage += " !!! EMERGENCY ERROR happened! Validate orders!\n";
                if(config.stopTradingOnError){
                    await tools.sleep(999999999);
                    return false;
                } else {
                    return false;
                }
            }
            if(accountTransferId.data > 0){
                //Save fund transfer to history
                await db.saveFundTransferHistory(config.name, pair, repayAmount, "fromSpot", accountTransferId.data);
                //Check margin detail to get data for repay
                let marginDetail = await api.accountMarginDetail();
                if(!marginDetail.s){
                    apiCounter++;
                    await email.sendEmail("API Error accountMarginDetail ", pair.name +" #"+ pair.id +" need manual validate accountMarginDetail: " + JSON.stringify(marginDetail));
                    logMessage += " !!! EMERGENCY ERROR happened! Validate orders!\n";
                    if(config.stopTradingOnError){
                        await tools.sleep(999999999);
                        return false;
                    } else {
                        return false;
                    }
                }
                //Find correct asset for actual trade what we want repay
                const marginPairDetail = marginDetail.data.userAssets.find(o => o.asset === pair.name.split(pair.separator)[1]);
                console.error("### repayAmount: " + repayAmount);
                let marginRepayAmount = repayAmount;

                if((marginPairDetail.borrowed-marginRepayAmount) < 0){
                    //If we try repay more then we have borrowed. Repay only rest of borrowed funds
                    marginRepayAmount = marginPairDetail.borrowed;
                }
                if(marginPairDetail.borrowed > 0){
                    //Request repay borrowed fund
                    const marginRepayId = await api.marginRepay(config.name, pair, marginRepayAmount);
                    if(!marginRepayId.s){
                        apiCounter++;
                        await email.sendEmail("API Error marginRepayId ", pair.name +" #"+ pair.id +" need manual validate marginRepayId: " + JSON.stringify(marginRepayId));
                        logMessage += " !!! EMERGENCY ERROR happened! Validate orders!\n";
                        if(config.stopTradingOnError){
                            await tools.sleep(999999999);
                            return false;
                        } else {
                            return false;
                        }
                    }
                    //Save repay borrowed funding to history
                    await db.saveFundingHistory(config.name, pair, marginRepayAmount, "repay", marginRepayId.data);
                }
                console.error("### marginRepayAmount: " + marginRepayAmount);
                //Update balance and available after margin repay success
                myAccount.balance[pair.name.split(pair.separator)[1]] -= repayAmount;
                myAccount.available[pair.name.split(pair.separator)[1]] -= repayAmount;
                //Update actual state of funding for current pair to database
                await db.updateFunding(config.name, pair, repayAmount, "repay");
            }
        }

    }
}

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
                    case "binance":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "itbit":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "kraken":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                }
            } else if(orderDetail.fee < 0){
                switch (config.name) {
                    case "coinmate":
                        myAccount.balance[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        break;
                    case "itbit":
                        myAccount.balance[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.fee;
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
                    case "binance":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "itbit":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "kraken":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                }
            } else if(orderDetail.fee < 0){
                switch (config.name) {
                    case "coinmate":
                        myAccount.balance[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        break;
                    case "itbit":
                        myAccount.balance[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.fee;
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
                    case "binance":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "itbit":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "kraken":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                }
            } else if(orderDetail.fee < 0){
                switch (config.name) {
                    case "coinmate":
                        myAccount.balance[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        break;
                    case "itbit":
                        myAccount.balance[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.fee;
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
                    case "binance":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "itbit":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                    case "kraken":
                        myAccount.balance[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] -= orderDetail.fee;
                        break;
                }
            } else if(orderDetail.fee < 0){
                switch (config.name) {
                    case "coinmate":
                        myAccount.balance[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        break;
                    case "itbit":
                        myAccount.balance[pair.name.split(pair.separator)[1]] += orderDetail.fee;
                        myAccount.available[pair.name.split(pair.separator)[1]] += orderDetail.fee;
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
            apiCounter += createdOrder.counter;
            if(createdOrder.s){
                myAccount.available[pair.name.split(pair.separator)[0]] -= createdOrder.data.size;
                await db.setOpenedSellerOrder(pair, pendingSellOrder, createdOrder);
                return false;
            } else {
                if(createdOrder.data.error.includes("emergency stop")){
                    await email.sendEmail("API EMERGENCY STOP - createOrder SELL", pair.name +" #"+ pair.id +" need manual validate last SELL order: " + JSON.stringify(createdOrder));
                    await tools.sleep(999999999);
                } else if(createdOrder.data.error.includes("insufficient size")){
                    const nextSellOrder = await db.getNextSellOrder(config.name, pair, pendingSellOrder);
                    if(typeof nextSellOrder !== 'undefined' && nextSellOrder.hasOwnProperty('buy_id')){
                        // We have next sell order, where we can adjust sell_size from insufficient size order
                        const adjustFailedSellOrder = await db.adjustFailedSellOrder(pair, pendingSellOrder, nextSellOrder);
                        if(adjustFailedSellOrder){
                            //Disable failed order after sell_size was merged to nextSellOrder.
                            const failedSellOrder = {"id": pendingSellOrder.buy_id, "status": "Merged to buy_id " +nextSellOrder.buy_id};
                            await db.setFailedSellOrder(failedSellOrder);
                            await email.sendEmail("API Adjusted - createOrder SELL", pair.name +" #"+ pair.id +" adjusted  order " + JSON.stringify(nextSellOrder) + " from failed sell order " + JSON.stringify(pendingSellOrder));
                            logMessage += " !!! Sell order "+pendingSellOrder.buy_id+" merged to "+nextSellOrder.buy_id+" due to insufficient order size!\n";
                        } else {
                            await email.sendEmail("API Adjusted Failed - createOrder SELL", pair.name +" #"+ pair.id +" adjusted  order " + JSON.stringify(nextSellOrder) + " from failed sell order " + JSON.stringify(pendingSellOrder));
                            await tools.sleep(999999999);
                        }
                    } else{
                        const failedSellOrder = {"id": pendingSellOrder.buy_id, "status": "insufficient_size"};
                        await db.setFailedSellOrder(failedSellOrder);
                        //If sell order failed to to insufficient size, we need deduct funded value, because we cannot return it automatically.
                        if(pair.active.margin){
                            const failedBorrowedAmount =  tools.setPrecision( pendingSellOrder.sell_size*pendingSellOrder.buy_price , 8);
                            console.error("Failed sell order due to insufficient size, not possible do refund!");
                            console.error(failedBorrowedAmount + " " + pair.name.split(pair.separator)[1]);
                            //Save fund transfer to history
                            await db.saveFundTransferHistory(config.name, pair, failedBorrowedAmount, "failed", 0);
                            //Update actual state of funding for current pair to database
                            await db.updateFunding(config.name, pair, failedBorrowedAmount, "repay");

                        }
                        logMessage += " !!! Sell order "+pendingSellOrder.buy_id+" finished due to insufficient order size!\n";
                    }
                    return false;
                } else if(createdOrder.data.error.includes("repeat")){
                    logMessage += " !!! Sell order "+pendingSellOrder.buy_id+" Repeat order due to:\n "+createdOrder.data.reason+"!\n";
                    return false;
                } else if(createdOrder.data.error.includes("rejected")){
                    logMessage += " !!! Sell order "+pendingSellOrder.buy_id+" rejected due to order would immediately match and take!\n";
                    return false;
                } else if(createdOrder.data.error.includes("not_submitted")){
                    //TRADING stopped, do manual validate what happened
                    await email.sendEmail("API Timeout - sell order not submitted", pair.name +" #"+ pair.id +" need manual validate last sell order: " + JSON.stringify(createdOrder));
                    logMessage += JSON.stringify(createdOrder.data)+"\n";
                    if(config.stopTradingOnError){
                        await tools.sleep(999999999);
                    } else {
                        return false;
                    }
                } else if(createdOrder.data.error.includes("ESOCKETTIMEDOUT")){
                    //TRADING stopped, do manual validate what happened
                    await email.sendEmail("API ESOCKETTIMEDOUT - createOrder SELL", pair.name +" #"+ pair.id +" need manual validate last SELL order: " + JSON.stringify(createdOrder));
                    logMessage += JSON.stringify(createdOrder.data)+"\n";
                    if(config.stopTradingOnError){
                        await tools.sleep(999999999);
                    } else {
                        return false;
                    }
                } else if(createdOrder.data.error.includes("Not response from server")){
                    //TRADING stopped, do manual validate what happened
                    await email.sendEmail("API ERROR 504 - createOrder SELL", pair.name +" #"+ pair.id +" need manual validate last SELL order: " + JSON.stringify(createdOrder));
                    logMessage += JSON.stringify(createdOrder.data)+"\n";
                    if(config.stopTradingOnError){
                        await tools.sleep(999999999);
                    } else {
                        return false;
                    }
                }  else {
                    console.error(createdOrder);
                    await email.sendEmail("API UNKNOWN - createOrder SELL", pair.name +" #"+ pair.id +" need manual validate last SELL order: " + JSON.stringify(createdOrder));
                    await tools.sleep(999999999);
                }
            }
        } else {
            logMessage += " !!! Canceled, profit is < 0 for pendingSellOrder at current targetAsk!\n";
            logMessage += JSON.stringify(pendingSellOrder)+"\n";
            return false;
        }
    } else {
        logMessage += " !!! No sell order for this ask price!\n";
        if(pair.strategy.sellOldestOrderWithLoss || pair.strategy.sellOldestOrderWithLossWhenProfit.active){
            //Continue only if pendingSellOlder is in loss
            if(tools.calculatePendingProfit(pendingSellOrder, targetAsk) < 0){
                let lossOpened = false;
                if(pair.strategy.sellOldestOrderWithLossWhenProfit.active){
                    lossOpened = await sellOldestOrderWithLossWhenProfit(config.name, pair, targetAsk);
                }
                if(pair.strategy.sellOldestOrderWithLoss && !lossOpened){
                    let setOldestOrderWithLossForSell = false;
                    const totalAmount = await tools.getAmountSpent(db, config.name, pair);
                    let logMessageDetail = " $$$ Sell the oldest order with a loss, if the budget limit was reached!\n";

                    if(pair.moneyManagement.autopilot.active && pair.moneyManagement.autopilot.budgetLimit > 0 && totalAmount >= pair.moneyManagement.autopilot.budgetLimit){
                        setOldestOrderWithLossForSell = true;
                    } else if(pair.moneyManagement.supportLevel.active && pair.moneyManagement.supportLevel.budgetLimit > 0 && totalAmount >= pair.moneyManagement.supportLevel.budgetLimit){
                        setOldestOrderWithLossForSell = true;
                    } else if(pair.moneyManagement.buyPercentageAvailableBalance.active && pair.moneyManagement.buyPercentageAvailableBalance.budgetLimit > 0 && totalAmount >= pair.moneyManagement.buyPercentageAvailableBalance.budgetLimit){
                        setOldestOrderWithLossForSell = true;
                    } else if(pair.moneyManagement.buyPercentageAvailableBudget.active && pair.moneyManagement.buyPercentageAvailableBudget.budgetLimit > 0 && totalAmount >= pair.moneyManagement.buyPercentageAvailableBudget.budgetLimit){
                        setOldestOrderWithLossForSell = true;
                    } else if(pair.moneyManagement.buyForAmount.active && pair.moneyManagement.buyForAmount.budgetLimit > 0 && totalAmount >= pair.moneyManagement.buyForAmount.budgetLimit){
                        setOldestOrderWithLossForSell = true;
                    } else if(pair.moneyManagement.buySize.active && pair.moneyManagement.buySize.budgetLimit > 0 && totalAmount >= pair.moneyManagement.buySize.budgetLimit){
                        setOldestOrderWithLossForSell = true;
                    } else if(pair.moneyManagement.buySize.active && pair.moneyManagement.buySize.bagHolderLimit > 0){
                        const resultTotalSellSize = await db.getTotalSellSize(config.name, pair);
                        if(resultTotalSellSize >= pair.moneyManagement.buySize.bagHolderLimit){
                            logMessageDetail = " $$$ Sell the oldest order with a loss, if the bag holder (total size) limit was reached!\n";
                            setOldestOrderWithLossForSell = true;
                        }
                    }
                    if(setOldestOrderWithLossForSell){
                        logMessage += logMessageDetail;
                        const forSell = await db.setOldestOrderWithLossForSell(config.name, pair);
                        logMessage += JSON.stringify(forSell)+"\n";
                    }
                }
            }
        }
        return false;
    }
}

async function sellOldestOrderWithLossWhenProfit(config_name, pair, targetAsk){
    const totalPositiveProfit = await db.getPositiveProfit(config_name, pair);
    //console.error("totalPositiveProfit: " + totalPositiveProfit);
    const totalProfitForLosses = tools.getPercentage(Math.abs((100 - pair.strategy.sellOldestOrderWithLossWhenProfit.keepPercentageOfProfit)), totalPositiveProfit, (pair.digitsPrice+2)) ;
    //console.error("totalProfitForLosses: " + totalProfitForLosses);
    const totalNegativeProfit = await db.getNegativeProfit(config_name, pair);
    //console.error("totalNegativeProfit: " + totalNegativeProfit);
    const availableProfitForLosses = totalProfitForLosses - Math.abs(totalNegativeProfit);
    //console.error("availableProfitForLosses: " + availableProfitForLosses);

    const oldestOrder = await db.getOldestPendingSellOrder(config_name, pair);
    const pl = tools.calculatePendingProfit(oldestOrder, targetAsk);
    const so = await db.getAllNonFrozenSellOrdersCount(config_name, pair.name, pair.id);

    if(pl < 0) {
        if ((availableProfitForLosses - Math.abs(pl)) > 0 && so.count > pair.strategy.sellOldestOrderWithLossWhenProfit.minPendingSellOrders) {
            await db.setSellTargetPrice(config_name, pair, oldestOrder.buy_id, 0);
            return true;
        } else {
            return false;
        }
    }
}

async function processBidOrder(pair, valueForSize, targetBid){
    if(targetBid === 0){
        logMessage += " !!! Skipping process bid order because targetBid === 0!\n";
        return false;
    } else {
        logMessage += " ### Let´go open new buy order!\n";
        const createdOrder = await api.createOrder(pair,"BUY",null, valueForSize, targetBid);
        apiCounter++;
        if(createdOrder.s){
            myAccount.available[pair.name.split(pair.separator)[1]] -= createdOrder.data.funds;
            await db.saveOpenedBuyOrder(config.name, pair, createdOrder);
            return true;
        } else {
            if(createdOrder.data.error.includes("emergency stop")){
                await email.sendEmail("API EMERGENCY STOP - createOrder BUY", pair.name +" #"+ pair.id +" need manual validate last BUY order: " + JSON.stringify(createdOrder));
                await tools.sleep(999999999);
            } else if(createdOrder.data.error.includes("insufficient size")){
                console.error("Minimum Order Size: insufficient buy size!");
            } else if(createdOrder.data.error.includes("Size order not set in config.")){
                console.error("Size order not set in config.");
            } else if(createdOrder.data.error.includes("repeat")){
                logMessage += " !!! Repeat BUY order due to:\n "+createdOrder.data.reason+"!\n";
                return false;
            } else if(createdOrder.data.error.includes("rejected")){
                logMessage += " !!! Order rejected would immediately match and take!\n";
                return false;
            } else if(createdOrder.data.error.includes("not_submitted")){
                //TRADING stopped, do manual validate what happened
                await email.sendEmail("API Timeout - buy order not submitted", pair.name +" #"+ pair.id +" need manual validate last buy order: " + JSON.stringify(createdOrder));
                logMessage += " !!! NOT PROCESSED, repeat !!!!\n";
                logMessage += JSON.stringify(createdOrder.data)+"\n";
                if(config.stopTradingOnError){
                    await tools.sleep(999999999);
                } else {
                    return false;
                }
            } else if(createdOrder.data.error.includes("ESOCKETTIMEDOUT")){
                //TRADING stopped, do manual validate what happened
                await email.sendEmail("API ESOCKETTIMEDOUT - createOrder BUY", pair.name +" #"+ pair.id +" need manual validate last BUY order: " + JSON.stringify(createdOrder));
                logMessage += JSON.stringify(createdOrder.data)+"\n";
                if(config.stopTradingOnError){
                    await tools.sleep(999999999);
                } else {
                    return false;
                }
            } else if(createdOrder.data.error.includes("Not response from server")){
                //TRADING stopped, do manual validate what happened
                await email.sendEmail("API ERROR 504 - createOrder BUY", pair.name +" #"+ pair.id +" need manual validate last BUY order: " + JSON.stringify(createdOrder));
                logMessage += JSON.stringify(createdOrder.data)+"\n";
                if(config.stopTradingOnError){
                    await tools.sleep(999999999);
                } else {
                    return false;
                }
            } else {
                await email.sendEmail("API UNKNOWN ERROR - createOrder BUY", pair.name +" #"+ pair.id +" need manual validate last BUY order: " + JSON.stringify(createdOrder));
                await tools.sleep(999999999);
            }
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
