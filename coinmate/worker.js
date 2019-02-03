const coinmate = require('./api');
const tools = require('../src/tools');

let config;
let myAccount;
let doOrder = "ask";

let init = async function(){
    myAccount = await getBalance();
    console.log(myAccount);
    begin();
};

let getBalance = async function(){
    const rawBalance = await coinmate.getBalance();
    return await tools.parseBalance(config, rawBalance);
};

async function begin(){
    config.debug && console.log(new Date().toISOString()+" >>> Let´s call again start()");
    await start();
    config.debug && console.log(new Date().toISOString()+" $$$ start() finished, start again. ");
    await tools.sleep(2500);
    console.log(myAccount.coinfalcon);
    begin();
}

async function start() {
    if(doOrder === "ask"){
        // Parse all currency pair in config and check if is available balance for sell trade
        for(let i=0;i<config.pairs.length;i++){
            let pair = config.pairs[i];

            config.debug && console.log(new Date().toISOString()+" ### Lets process ask for "+ pair.name+" in the loop.");
            //let sellingForCurrency = pair.name.split('-')[1];
            //let sellingCurrency = pair.name.split('-')[0];

            //Get lowest pending sell order
            const pendingSellOrder = await db.getLowestFilledBuyOrder(config.name, pair.name);
            await tools.sleep(899999);
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
            if(resultCoinfalconTicker.s){
                tickersCoinfalcon[pair.name] = await coinfalcon.parseTicker("ask", resultCoinfalconTicker.data, pair, resultOpenedSellOrder);
            } else {
                //Return false will start ask process again
                return false;
            }

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
            if(resultCoinfalconTicker.s){
                tickersCoinfalcon[pair.name] = await coinfalcon.parseTicker("bid", resultCoinfalconTicker.data, pair, resultOpenedBuyOrder);
            } else {
                //Return false will start ask process again
                return false;
            }

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

process.on('message', async function(data) {
    switch (data.type) {
        case "init":
            config = data.config;
            coinmate.setConfig(data.config);
            init();
            break;
        case "balance":
            process.send({"type": "balance", "balance": myAccount});
            break;
    }
});