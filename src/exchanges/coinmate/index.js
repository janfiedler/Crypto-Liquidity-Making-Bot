let cp = require('child_process');
let coinmateWorker = cp.fork('src/exchanges/coinmate/worker.js');

let config;

let start = function(configuration){
    config = configuration;
    coinmateWorker.send({"type": "init", "config": config});
};

let stop = function(){
    return new Promise(function (resolve) {
        coinmateWorker.send({"type": "stop"});
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
    }
});

module.exports = {
    start: start,
    stop: stop
};