let cp = require('child_process');
let itbitWorker = cp.fork('src/exchanges/itbit/worker.js');
let ws = require('./../../websocket');

let config;

let start = function(configuration){
    config = configuration;
    itbitWorker.send({"type": "init", "config": config});
};

let stop = function(){
    return new Promise(function (resolve) {
        itbitWorker.send({"type": "stop"});
        setTimeout(function(){
            //If worker cannot be stopped, mark him for skip
            resolve(false);
        }, 25000);

        itbitWorker.on('exit', (code, signal) => {
            //console.log('Exit', code, signal);
            resolve(true);
        });
    });
};

itbitWorker.on('message', async function (data) {
    switch (data.type) {
        case "init":
            if(data.success){
            }
            break;
        case "stopped":
            console.log("itbitWorker stopped");
            itbitWorker.kill();
            break;
        case "ticker":
            ws.emitPendingOrders(data);
            break;
        case "completedOrder":
            ws.emitCompletedOrder(data);
            break;
    }
});

module.exports = {
    start: start,
    stop: stop
};