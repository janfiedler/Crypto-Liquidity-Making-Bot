let cp = require('child_process');
let coinmateWorker = cp.fork('src/exchanges/coinmate/worker.js');
let ws = require('./../../websocket');
let tools = require('./../../tools');

let config;
let db;

let start = function(configuration, database){
    config = configuration;
    db = database;
    coinmateWorker.send({"type": "init", "config": config});
};

let stop = function(){
    return new Promise(function (resolve) {
        coinmateWorker.send({"type": "stop"});
        setTimeout(function(){
            //If worker cannot be stopped, mark him for skip
            resolve(false);
        }, 25000);

        coinmateWorker.on('exit', (code, signal) => {
            //console.log('Exit', code, signal);
            resolve(true);
        });
    });
};

coinmateWorker.on('message', async function (data) {
    switch (data.type) {
        case "init":
            if(data.success){
            }
            break;
        case "stopped":
            console.log("coinmateWorker stopped");
            coinmateWorker.kill();
            break;
        case "ticker":
            const po = await db.getAllPendingOrders(data.exchange, data.pair);
            const dailyProfit = await db.sumProfit(data.exchange, data.pair, new Date().toISOString().substr(0,10)+"%");
            let pendingOrders = [];
            for(let i=0;i<po.length;i++){
                const pl = tools.calculatePendingProfit(po[i].exchange, po[i], data.tick.bid);
                pendingOrders.push({"buy_id": po[i].buy_id, "buy_price": po[i].buy_price, "sell_size": po[i].sell_size, "sell_target_price": po[i].sell_target_price, "pl": pl});
            }
            ws.emitToAll("ticker", {"exchange": data.exchange, "pair": data.pair, "tick": data.tick, "dailyProfit": dailyProfit, "pendingOrders": pendingOrders});
            break;
    }
});

module.exports = {
    start: start,
    stop: stop
};