let cp = require('child_process');
const ws = require("./../../websocket");
let ftxWorker = cp.fork("src/exchanges/ftx/worker.js");

let config;

let start = function(configuration){
    config = configuration;
    ftxWorker.send({"type": "init", "config": config});
};

let stop = function(){
    return new Promise(function (resolve) {
        ftxWorker.send({"type": "stop"});
        setTimeout(function(){
            //If worker cannot be stopped, mark him for skip
            resolve(false);
        }, 25000);

        ftxWorker.on('exit', (code, signal) => {
            //console.log('Exit', code, signal);
            resolve(true);
        });
    });
};

ftxWorker.on('message', async function (data) {
    switch (data.type) {
        case "init":
            if(data.success){
            }
            break;
        case "stopped":
            console.log("ftdWorker stopped");
            ftxWorker.kill();
            break;
        case "ticker":
            ws.emitPendingOrders(data);
            break;
        case "completedOrder":
            ws.emitCompletedOrder(data);
            break;
        case "filledBuyOrder":
            ws.emitFilledBuyOrder(data);
            break;
    }
});

module.exports = {
    start,
    stop
};