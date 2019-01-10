let env = process.env.NODE_ENV || 'development';
let config = require('../config')[env];
let request = require('request');
let crypto = require('crypto');
var coinfalcon = require('../coinfalcon');
var bitfinex = require('../bitfinex');

// Start with ask order
let doOrder = "ask";


let myAccount = {balanceEUR: 0.0000,availableEUR: 0.0000,balanceIOT: 0.0000,availableIOT: 0.0000,"buyId": "", buyPrice:0.0000, "sellId":"", sellPrice:0.0000};
let ticksCoinfalcon = {bidBorder: 0.0000, bid: 0.0000, bidSize: 0.0, bidSecond: 0.0000, bidSecondSize: 0.00, askBorder: 0.0000, ask: 0.0000, askSize: 0.0, askSecond: 0.0000, askSecondSize: 0.0};
let ticksBitfinex = {bid: 0.0000, ask: 0.0000};

const sleepPause = config.sleepPause;

async function begin(){
    await start();
    setTimeout(begin, 1000);
}
begin();

async function start() {
    //update my available accounts balance
    const balance = await coinfalcon.getAccountsBalance();
    myAccount = await parseBalance(balance, myAccount);
    //get price from external source

    console.log(new Date().toISOString()+" await bitfinex.getPriceIOTEUR()");
    const price = await bitfinex.getPriceIOTEUR();
    if(price.s){
        ticksBitfinex.bid = parseFloat(price.body[0].toFixed(4));
        ticksBitfinex.ask = parseFloat(price.body[2].toFixed(4));
    } else {
        console.error("Faild fetch prices from bitfinex, wait 10 seconds and start again");
        await sleep(10000);
        return true;
    }

    //Get my orders on start || when buy order was closed by fully filled || when sell order was fully filled
    if(myAccount.buyId === "" && myAccount.sellId === "" || myAccount.buyId !== "" && myAccount.availableEUR > 0 || myAccount.sellId !== "" && myAccount.availableIOT > 0 ){
        console.log(new Date().toISOString()+" Get my opened orders");
        let data = await coinfalcon.getOrders("open");
        if(data.data.length > 0){
            await parseMyOrders(data);
        }
        data = await coinfalcon.getOrders("partially_filled");
        if(data.data.length > 0){
            await parseMyOrders(data);
        }
    }
    console.log(myAccount);

    //fetch actual prices IOT/EUR on coinfalcon exchange
    console.log(new Date().toISOString()+" fetch actual prices IOT/EUR on coinfalcon exchange");
    ticksCoinfalcon = await fetchCoinfalconOrders(ticksCoinfalcon);
    console.log(ticksCoinfalcon);

    if(doOrder === "ask"){
        //find open price for ask order
        let targetAsk = await findSpotForAsk();
        if(myAccount.sellId !== ""){
            const canceled = await checkForCancelOrder("ask", targetAsk);
            if(canceled){
                console.log(new Date().toISOString()+" My ask order was canceled");
                //const balance = await coinfalcon.getAccountsBalance();
                //myAccount = await parseBalance(balance, myAccount);
                //await fetchCoinfalconOrders();
                //targetAsk = await findSpotForAsk();
            }
        }
        //process ask order
        await processAskOrder(targetAsk);

        //wait x = (sleepPause) seconds on reaction others bot before we set bid order
        await sleep(sleepPause);
        doOrder = "bid";
        return true;
    }

    if(doOrder === "bid"){
        //find price for bid order

        let targetBid = await findSpotForBid();
        if(myAccount.buyId !== ""){
            let canceled = await checkForCancelOrder("bid", targetBid);
            if(canceled){
                console.log(new Date().toISOString()+" My bid order was canceled");
                //const balance = await coinfalcon.getAccountsBalance();
                //myAccount = await parseBalance(balance, myAccount);
                //await fetchCoinfalconOrders();
                //targetBid = await findSpotForBid();
            }
        }
        //process bid order
        await processBidOrder(targetBid);

        //wait x = (sleepPause)  seconds on reaction others bot before we set ask order
        await sleep(sleepPause);
        doOrder = "ask";
        return true;
    }
}

async function checkForCancelOrder(type, newPrice){
    let canceled = false;
    switch(type){
        case "ask":
            if(myAccount.availableIOT > 0){
                //If availableIOT > 0 some buy order filled. Cancel sell order and make new with full size.
                console.log(new Date().toISOString()+" If availableIOT > 0 some buy order filled. Cancel sell order and make new with full size.");
                myAccount = await coinfalcon.cancelOrder("sell", myAccount);
                canceled = true;
            } else if(newPrice !== myAccount.sellPrice && myAccount.sellId !== ""){
                //If new bid price is higher than my actual and it is not close than 0.0010 to ticksCoinfalcon.ask, than close actual order for make new.
                console.log(new Date().toISOString()+" We have new price, need close old sell order");
                myAccount = await coinfalcon.cancelOrder("sell", myAccount);
                canceled = true;
            }
            break;
        case "bid":
            if(myAccount.availableEUR > 0 && myAccount.buyId !== ""){
                //If availableEUR > 0 some sell order filled. Cancel buy order and make new with full size.
                console.log(new Date().toISOString()+" If availableEUR > 0 some sell order filled. Cancel buy order and make new with full size.");
                myAccount = await coinfalcon.cancelOrder("buy", myAccount);
                canceled = true;
            } else if(newPrice !== myAccount.buyPrice && myAccount.buyId !== ""){
                //If new bid price is higher than my actual and it is not close than 0.0010 to ticksCoinfalcon.ask, than close actual order for make new.
                console.log(new Date().toISOString()+" We have new price, need close old buy order");
                myAccount = await coinfalcon.cancelOrder("buy", myAccount);
                canceled = true;
            }
            break;
    }
    return canceled;
}

async function fetchCoinfalconOrders(ticksCoinfalcon){
    const coinfalconOrders = await coinfalcon.getPriceIOTEUR(2);
    //console.log(coinfalconOrders.data.bids);
    let ii=0;
    for(let i=0;i<coinfalconOrders.data.asks.length;i++){
        if(i===0){
            ticksCoinfalcon.askBorder = parseFloat(parseFloat(coinfalconOrders.data.asks[i].price).toFixed(4));
        }
        if(coinfalconOrders.data.asks[i].size > config.ignoreOrderSize){
            ii++;
            if(ii === 1){
                ticksCoinfalcon.ask = parseFloat(parseFloat(coinfalconOrders.data.asks[i].price).toFixed(4));
                ticksCoinfalcon.askSize = parseFloat(parseFloat(coinfalconOrders.data.asks[i].size).toFixed(4));
            } else if (ii === 2){
                ticksCoinfalcon.askSecond = parseFloat(parseFloat(coinfalconOrders.data.asks[i].price).toFixed(4));
                ticksCoinfalcon.askSecondSize = parseFloat(parseFloat(coinfalconOrders.data.asks[i].size).toFixed(4));
                break;
            }
        }
    }
    ii=0;
    for(let i=0;i<coinfalconOrders.data.bids.length;i++){
        if(i === 0){
            ticksCoinfalcon.bidBorder = parseFloat(parseFloat(coinfalconOrders.data.bids[i].price).toFixed(4));
        }
        if(coinfalconOrders.data.bids[i].size > config.ignoreOrderSize){
            ii++;
            if(ii === 1){
                ticksCoinfalcon.bid = parseFloat(parseFloat(coinfalconOrders.data.bids[i].price).toFixed(4));
                ticksCoinfalcon.bidSize = parseFloat(parseFloat(coinfalconOrders.data.bids[i].size).toFixed(4));
            } else if (ii === 2){
                ticksCoinfalcon.bidSecond = parseFloat(parseFloat(coinfalconOrders.data.bids[i].price).toFixed(4));
                ticksCoinfalcon.bidSecondSize = parseFloat(parseFloat(coinfalconOrders.data.bids[i].size).toFixed(4));
                break;
            }
        }
    }
    return ticksCoinfalcon;
}

async function findSpotForAsk(){
    let targetAsk = 0.0000;
    console.log(new Date().toISOString()+" Bitfinex ask: " + ticksBitfinex.ask);
    console.log(new Date().toISOString()+" Coinfalcon ask: " + ticksCoinfalcon.ask);
    console.log(new Date().toISOString()+" Coinfalcon bid: " + ticksCoinfalcon.bid);
    //console.log(typeof myAccount.sellPrice);
    if(ticksCoinfalcon.ask === myAccount.sellPrice){
        console.log(new Date().toISOString()+" ### ticksCoinfalcon.ask is my opened order");
        targetAsk = myAccount.sellPrice;

        if(ticksBitfinex.ask > myAccount.sellPrice &&  ticksBitfinex.ask < ticksCoinfalcon.askSecond){
            console.log(new Date().toISOString()+" ### Replacing our sell order to higher price");
            targetAsk = ticksBitfinex.ask;
        }
        /* When we want copy bitfinex ticks
        else if(ticksBitfinex.ask < myAccount.sellPrice &&  ticksBitfinex.ask > Math.floor((ticksCoinfalcon.bid+0.0010)*10000)/10000){
            console.log(new Date().toISOString()+" ### Replacing our sell order to lower price");
            targetAsk = ticksBitfinex.ask;
        } else {
            console.log(new Date().toISOString()+" ### No reason for replacing sell order");
        }
        */

        console.log("### ticksCoinfalcon.askSize: " + ticksCoinfalcon.askSize);
        console.log("### myAccount.balanceIOT: " + myAccount.balanceIOT);
        console.log("### Size comparator: " + (ticksCoinfalcon.askSize-myAccount.balanceIOT));
        // If targetAsk is lower price than askSecond and my sell order is only one higher and bigger than 10 IOTA, move close to askSecond
        if(targetAsk < (ticksCoinfalcon.askSecond-0.0001) && (ticksCoinfalcon.askSize-myAccount.balanceIOT) <= config.ignoreOrderSize){
            console.log(new Date().toISOString()+" ### To far away from askSecond, let askSecond-0.0001");
            targetAsk = Math.floor((ticksCoinfalcon.askSecond-0.0001)*10000)/10000;
        }
    } else {
        /* When we want copy bitfinex ticks
        if(ticksBitfinex.ask > ticksCoinfalcon.bid && ticksBitfinex.ask < ticksCoinfalcon.ask){
            console.log(new Date().toISOString()+" ### Target ask is equal to bitfinexAsk");
            targetAsk = ticksBitfinex.ask;
        } else if(ticksBitfinex.ask > ticksCoinfalcon.bid && ticksBitfinex.ask >= ticksCoinfalcon.ask){
            console.log(new Date().toISOString()+" new Date().toISOString()+ ### bitfinexAsk > coinfalconBid && bitfinexAsk >= ticksCoinfalcon.ask add 0.0001 below to be first");
            targetAsk =  Math.floor((ticksCoinfalcon.ask-0.0001)*10000)/10000;
        } else if( ticksBitfinex.ask === ticksCoinfalcon.bid){
            targetAsk =  Math.floor((ticksBitfinex.ask+0.0011)*10000)/10000;
        } else if(ticksBitfinex.ask <= ticksCoinfalcon.bid) {
            console.log(new Date().toISOString()+" ### Bitfinex ask is bigger than  coinfalconBid, go +11 from ask");
            targetAsk = Math.floor((ticksCoinfalcon.bid+0.0011)*10000)/10000;
        } else {
            console.error(new Date().toISOString()+" ### There is problem with find new bid price!");
        }
        */
        // If ask price is not lower than on bitfinex (dont be cheaper than on bitfinex) you can be cheaper than others
        let preTargetAsk = Math.floor((ticksCoinfalcon.ask-0.0001)*10000)/10000;
        if(preTargetAsk >= ticksBitfinex.ask){
            targetAsk = preTargetAsk;
            console.log(new Date().toISOString()+" ### targetAsk "+targetAsk+" >= ticksBitfinex.ask "+ticksBitfinex.ask+" sell for better price than others "+ticksCoinfalcon.ask+" - 0.0001");
        } else {
            // Else dont go for cheaper price than on bitfinex, stay at bitfinex ask price.
            targetAsk =  ticksBitfinex.ask;
        }
    }
    //Validate if new target ask is not close to bid order or taking bid order.
    if(targetAsk < Math.floor((ticksCoinfalcon.bidBorder+0.0010)*10000)/10000) {
        console.log(new Date().toISOString()+ "targetAsk: " + targetAsk);
        console.log(new Date().toISOString()+ "### New target ask is in danger zone, need go higher with price");
        targetAsk = Math.floor((ticksCoinfalcon.bidBorder+0.0010)*10000)/10000;
    }
    console.log(new Date().toISOString()+" targetAsk: " + targetAsk);
    return targetAsk;
}

async function findSpotForBid(){
    let targetBid = 0.0000;
    console.log(new Date().toISOString()+" Bitfinex bid: " + ticksBitfinex.bid);
    console.log(new Date().toISOString()+" Coinfalcon ask: " + ticksCoinfalcon.ask);
    console.log(new Date().toISOString()+" Coinfalcon bid: " + ticksCoinfalcon.bid);

    if(ticksCoinfalcon.bid === myAccount.buyPrice){
        console.log(new Date().toISOString()+" ### coinfalconBid is my opened order");
        targetBid = myAccount.buyPrice;

        if(ticksBitfinex.bid < myAccount.buyPrice &&  ticksBitfinex.bid > ticksCoinfalcon.bidSecond){
            console.log(new Date().toISOString()+" ### Replacing our bid order to lower price");
            targetBid = ticksBitfinex.bid;
        }
        /* When we want copy bitfinex ticks
        else if(ticksBitfinex.bid > myAccount.buyPrice &&  ticksBitfinex.bid < Math.floor((ticksCoinfalcon.ask-0.0010)*10000)/10000){
            console.log(new Date().toISOString()+" ### Replacing our bid order to higher price");
            targetBid = ticksBitfinex.bid;
        } else {
            console.log(new Date().toISOString()+" ### No reason for replacing bid order");
        }
        */
        console.log("### ticksCoinfalcon.bidSecondSize: " + ticksCoinfalcon.bidSize);
        console.log("### myAccount.balanceEUR: " + myAccount.balanceEUR);
        console.log("### Size comparator: " + (ticksCoinfalcon.bidSize-(myAccount.balanceEUR/ticksCoinfalcon.bid)));
        // If target price is bigger than actual order and my sell order is only one bigger than 10 IOTA, move close to askSecond
        if(targetBid > (ticksCoinfalcon.bidSecond+0.0001) && (ticksCoinfalcon.bidSize-(myAccount.balanceEUR/ticksCoinfalcon.bid)) <= config.ignoreOrderSize ){
            console.log(new Date().toISOString()+" ### To far away from ticksCoinfalcon.bidSecond, let ticksCoinfalcon.bidSecond+0.0001");
            targetBid = Math.floor((ticksCoinfalcon.bidSecond+0.0001)*10000)/10000;
        }
    } else {
        /* When we want copy bitfinex ticks
        if(ticksBitfinex.bid < ticksCoinfalcon.ask && ticksBitfinex.bid > ticksCoinfalcon.bid){
            console.log(new Date().toISOString()+" ### Target bid is equal to bitfinexBid");
            targetBid = ticksBitfinex.bid;
        } else if(ticksBitfinex.bid < ticksCoinfalcon.ask && ticksBitfinex.bid <= ticksCoinfalcon.bid){
            console.log(new Date().toISOString()+" ### Target bid is equal to bitfinexBid");
            //targetBid = ticksBitfinex.bid;
            //console.log(new Date().toISOString()+" ### bitfinexBid <= ticksCoinfalcon.bid add 0.0001 above");
            targetBid = ticksCoinfalcon.bid+0.0001;
        } else if( ticksBitfinex.bid === ticksCoinfalcon.ask){
            targetBid = Math.floor((ticksBitfinex.bid - 0.0011)*10000)/10000;
        } else if(ticksBitfinex.bid >= ticksCoinfalcon.ask) {
            console.log(new Date().toISOString()+" ### Bitfinex bid is bigger than  ticksCoinfalcon.ask, go -11 from ask");
            targetBid = Math.floor((ticksCoinfalcon.ask - 0.0011)*10000)/10000;
        } else {
            console.error("###  There is problem with find new bid price!");
        }
        */

        /*
        if(targetBid > ticksCoinfalcon.bid){
        }
        */

        let preTargetBid =  Math.floor((ticksCoinfalcon.bid+0.0001)*10000)/10000;
        if(preTargetBid <= ticksBitfinex.bid){
            targetBid = preTargetBid;
            console.log(new Date().toISOString()+" ### targetBid "+targetBid+" <= ticksBitfinex.bid "+ticksBitfinex.bid+" pay more than others "+ticksCoinfalcon.bid+", add +0.0001");
        } else {
            targetBid = ticksBitfinex.bid;
        }
    }
    //Validate if new target bid is not close to ask order or taking ask order.
    if(targetBid > Math.floor((ticksCoinfalcon.askBorder-0.0010)*10000)/10000) {
        console.log(new Date().toISOString()+" targetBid: " + targetBid);
        console.log(new Date().toISOString()+" ### New target bid is in danger zone, need go lower with price");
        targetBid = Math.floor((ticksCoinfalcon.askBorder-0.0010)*10000 )/10000;
    }
    console.log(new Date().toISOString()+" targetBid: " + targetBid);
    return targetBid;
}

async function processAskOrder(targetAsk){
    if(myAccount.balanceIOT > 0 && myAccount.availableIOT > 0){
        console.log(new Date().toISOString()+" ### Let´go open new sell order!");
        myAccount = await coinfalcon.createOrder('sell', myAccount, targetAsk, myAccount.balanceIOT);
    } else {
        if(targetAsk === myAccount.sellPrice){
            console.log(new Date().toISOString()+" ### We already have opened ask order at " + targetAsk);
        } else {
            console.log(new Date().toISOString()+" ### Insufficient IOT funds");
        }
    }
    return true;
}

async function processBidOrder(targetBid){
    if(myAccount.balanceEUR > 0 && myAccount.availableEUR > 0){
        console.log(new Date().toISOString()+" ### Let´go open new buy order!");
        myAccount = await coinfalcon.createOrder('buy', myAccount, targetBid, myAccount.balanceEUR);
    } else {
        if(targetBid === myAccount.buyPrice){
            console.log(new Date().toISOString()+" ### We already have opened bid order at " + targetBid);
        } else {
            console.log(new Date().toISOString()+" ### Insufficient eur funds");
        }

    }
    return true;
}


async function parseBalance(funds, myAccount){
    for (const fund of funds.data) {
        switch(fund.currency_code){
            case "iot":
                myAccount.balanceIOT = Math.floor(fund.balance*10000)/10000;
                myAccount.availableIOT = Math.floor(fund.available_balance*10000)/10000;
                break;
            case "eur":
                myAccount.balanceEUR = Math.floor(fund.balance*10000)/10000;
                myAccount.availableEUR = Math.floor(fund.available_balance*10000)/10000;
                break;
        }
    }
    return myAccount;
}

async function parseMyOrders(orders){
    for (const order of orders.data) {
        switch(order.order_type) {
            case "buy":
                myAccount.buyId = order.id;
                myAccount.buyPrice = parseFloat(parseFloat(order.price).toFixed(4));
                break;
            case "sell":
                myAccount.sellId = order.id;
                myAccount.sellPrice = parseFloat(parseFloat(order.price).toFixed(4));
                break;
        }
    }
    return true;
}

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}