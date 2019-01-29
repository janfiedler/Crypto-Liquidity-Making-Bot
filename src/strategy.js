let config = require('../config');
const tools = require('../src/tools');

let findSpotForAskOrder = async function (pendingOrder, ticker, pair){
    const keysCount = Object.keys(ticker.ask).length;
    let targetAsk = 0;
    // Need take my size order from market for found real target ask price
    for(let i=0;i<keysCount;i++){
        if ((i+2) >= keysCount){
            break;
        }
        if(ticker.ask[i].size > (ticker.ask[(i+1)].size+ticker.ask[(i+2)].size) && ticker.ask[i].size > pendingOrder.sell_size){
            console.log(ticker.ask);
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
                console.log(ticker.bid);
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

let processFulfilledOrder = function(myAccount, pair, orderDetail){
    switch(orderDetail.order_type){
        case "buy":
            config.debug && console.log(new Date().toISOString()+" BID fulfilled");
            if(parseFloat(orderDetail.fee) > 0){
                myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.fee);
                myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(orderDetail.fee);
            }
            //We bought, need add new size to balance and available
            myAccount.coinfalcon.balance[pair.name.split('-')[0]] += parseFloat(orderDetail.size);
            myAccount.coinfalcon.available[pair.name.split('-')[0]] += parseFloat(orderDetail.size);
            //We bought, need take size from balance. Available was taken when opening buy order
            myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= parseFloat(orderDetail.funds);
            break;
        case "sell":
            config.debug && console.log(new Date().toISOString()+" ### ASK fulfilled");
            if(parseFloat(orderDetail.fee) > 0){
                myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= parseFloat(orderDetail.fee);
                myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(orderDetail.fee);
            }
            //We sold, need take size from balance. Available was taken when opening sell order
            myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.size);
            //We sold, need add new size to balance and available
            myAccount.coinfalcon.balance[pair.name.split('-')[1]] += parseFloat(orderDetail.funds);
            myAccount.coinfalcon.available[pair.name.split('-')[1]] += parseFloat(orderDetail.funds);
            break;
    }
    return myAccount;
};

let processPartiallyFilled = function (myAccount, pair, orderDetail){
    switch(orderDetail.order_type){
        case "buy":
            config.debug && console.log(new Date().toISOString()+" BID partially_filled");
            if(parseFloat(orderDetail.fee) > 0){
                myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.fee);
                myAccount.coinfalcon.available[pair.name.split('-')[0]] -= parseFloat(orderDetail.fee);
            }
            //We bought, need add new size to balance and available
            myAccount.coinfalcon.balance[pair.name.split('-')[0]] += parseFloat(orderDetail.size_filled);
            myAccount.coinfalcon.available[pair.name.split('-')[0]] += parseFloat(orderDetail.size_filled);
            //We bought, need take size from balance. Available was taken when opening buy order
            myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= (parseFloat(orderDetail.size_filled)*parseFloat(orderDetail.price));
            break;
        case "sell":
            config.debug && console.log(new Date().toISOString()+" ### ASK partially_filled");
            if(parseFloat(orderDetail.fee) > 0){
                myAccount.coinfalcon.balance[pair.name.split('-')[1]] -= parseFloat(orderDetail.fee);
                myAccount.coinfalcon.available[pair.name.split('-')[1]] -= parseFloat(orderDetail.fee);
            }
            //We sold, need take size from balance. Available was taken when opening sell order
            myAccount.coinfalcon.balance[pair.name.split('-')[0]] -= parseFloat(orderDetail.size_filled);
            //We sold, need add new size to balance and available
            myAccount.coinfalcon.balance[pair.name.split('-')[1]] += (parseFloat(orderDetail.size_filled)*parseFloat(orderDetail.price));
            myAccount.coinfalcon.available[pair.name.split('-')[1]] += (parseFloat(orderDetail.size_filled)*parseFloat(orderDetail.price));

            break;
    }
    return myAccount;
};

module.exports = {
    findSpotForAskOrder: findSpotForAskOrder,
    findSpotForBidOrder: findSpotForBidOrder,
    processFulfilledOrder: processFulfilledOrder,
    processPartiallyFilled: processPartiallyFilled
};
