let cp = require('child_process');
let coinfalconWorker = cp.fork('src/exchanges/coinfalcon/worker.js');

let config;

let start = function(configuration){
    config = configuration;
    coinfalconWorker.send({"type": "init", "config": config});
};

let stop = function(){
    return new Promise(function (resolve) {
        coinfalconWorker.send({"type": "stop"});
        coinfalconWorker.on('exit', (code, signal) => {
            //console.log('Exit', code, signal);
            resolve(true);
        });
    });
};

coinfalconWorker.on('message', async function (data) {
    switch (data.type) {
        case "init":
            if(data.success){
            }
            break;
        case "stopped":
            console.log("coinfalconWorker stopped");
            coinfalconWorker.kill();
            break;
    }
});

module.exports = {
    start: start,
    stop: stop
};