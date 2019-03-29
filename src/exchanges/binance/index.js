let cp = require('child_process');
let binanceWorker = cp.fork('src/exchanges/binance/worker.js');
let ws = require('./../../websocket');

let config;

let start = function(configuration){
    config = configuration;
    binanceWorker.send({"type": "init", "config": config});
};

let stop = function(){
    return new Promise(function (resolve) {
        binanceWorker.send({"type": "stop"});
        setTimeout(function(){
            //If worker cannot be stopped, mark him for skip
            resolve(false);
        }, 25000);

        binanceWorker.on('exit', (code, signal) => {
            //console.log('Exit', code, signal);
            resolve(true);
        });
    });
};

binanceWorker.on('message', async function (data) {
    switch (data.type) {
        case "init":
            if(data.success){
            }
            break;
        case "stopped":
            console.log("binanceWorker stopped");
            binanceWorker.kill();
            break;
        case "ticker":
            ws.emitPendingOrders(data);
            break;
    }
});

module.exports = {
    start: start,
    stop: stop
};