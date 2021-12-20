const strategy = require('../../strategy');
const tools = require('../../tools');
let db = require('../../../db/sqlite3');
const ftx = require("./api");

let config;
let myAccount;
let stop = false;
// Start with ask order because need check for sold out orders
let doOrder = "ask";

process.on('message', async function(data) {
    switch (data.type) {
        case "init":
            config = data.config;
            ftx.setConfig(data.config);
            if(config.webSocket){
                await ftx.initWebSocketConnection();
            }
            //init();
            break;
        case "stop":
            if(config.webSocket){
                await ftx.cancelWebSocketConnection();
            }
            stop = true;
            break
    }
});

process.on('SIGINT', () => {
    //Block kill process until parent request
});

let init = async function(){
    await db.connect();
    await recalculateProfitTarget();
    myAccount = await getBalance();
    await strategy.init(config, myAccount[config.name], db, coinmate);
    begin();
};

let getBalance = async function(){
    const rawBalance = await coinmate.getBalance();
    return await tools.parseBalance(config, rawBalance);
};

let recalculateProfitTarget = async function(){
    for(let i=0;i<config.pairs.length;i++){
        let pair = config.pairs[i];
        const po = await db.getAllSellOrders(config.name, pair.name, pair.id);
        for(let ii=0;ii<po.length;ii++){
            let sell_target_price;
            if(pair.strategy.profitTarget.percentage.active){
                sell_target_price = tools.getProfitTargetPrice(po[ii].buy_price, pair.strategy.profitTarget.percentage.value, pair.digitsPrice);
            } else if(pair.strategy.profitTarget.pips.active){
                sell_target_price = tools.addPipsToPrice(po[ii].buy_price, pair.strategy.profitTarget.pips.value, pair.digitsPrice);
            }
            await db.setSellTargetPrice(config.name, pair, po[ii].buy_id, sell_target_price);
        }
    }
};

async function begin(){
    await start();
    if(!stop){
        begin();
    } else {
        await db.close();
        process.send({"type": "stopped"});
    }
}

async function start() {
    if(doOrder === "ask"){
        await strategy.doAskOrder();
        doOrder = "bid";
        return true;
    } else if(doOrder === "bid"){
        await strategy.doBidOrder();
        doOrder = "ask";
        return true;
    }
}