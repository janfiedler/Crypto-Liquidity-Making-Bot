const coinfalcon = require('./api');
const strategy = require('../../strategy');
const tools = require('../../tools');
let db = require('../../../db/sqlite3');

let config;
let myAccount;
let stop = false;
// Start with ask order because need check for sold out orders
let doOrder = "ask";

process.on('message', async function(data) {
    switch (data.type) {
        case "init":
            config = data.config;
            coinfalcon.setConfig(data.config);
            init();
            break;
        case "stop":
            stop = true;
            break
    }
});

process.on('SIGINT', () => {
    //Block kill process until parent request
});

let init = async function(){
    await db.connect();
    myAccount = await getBalance();
    await strategy.init(config,myAccount[config.name], db, coinfalcon);
    begin();
};

let getBalance = async function(){
    const rawBalance = await coinfalcon.getBalance();
    return await tools.parseBalance(config, rawBalance);
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
    }else if(doOrder === "bid"){
        await strategy.doBidOrder();
        doOrder = "ask";
        return true;
    }
}


