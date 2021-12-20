let config = require('../config');
let db = require('../db/sqlite3');
const coinmate = require("./exchanges/coinmate/");

process.on('SIGINT', () => {
    handleWorkers("STOP");
});

// Init
(async function () {
    // Promise not compatible with config.debug && console.log, async is?
    await db.connect();
    await db.createTables();
    const condition = await db.getCondition("safe_shutdown");
    if(condition.value){
        await db.updateCondition("safe_shutdown", 0);
        handleWorkers("START");
    } else {
        console.error("The application did not close properly, first verify your orders and then do SET safe_shutdown = 1 in the status table!");
        await db.close();
        process.exit(0);
    }

})();

async function handleWorkers(type){
    for(let i=0;i<config.exchanges.length;i++){
        if(config.exchanges[i].active) {
            config.exchanges[i].debug && console.log(config.exchanges[i].name+" "+type+" request");
            switch (config.exchanges[i].name) {
                case "binance":
                    const binance = require('./exchanges/binance/');
                    if(type === "START"){
                        binance.start(config.exchanges[i]);
                    } else if(type === "STOP") {
                        await binance.stop();
                    }
                    break;
                case "coinfalcon":
                    const coinfalcon = require('./exchanges/coinfalcon/');
                    if(type === "START"){
                        coinfalcon.start(config.exchanges[i]);
                    } else if(type === "STOP") {
                        await coinfalcon.stop();
                    }
                    break;
                case "coinmate":
                    const coinmate = require('./exchanges/coinmate/');
                    if(type === "START"){
                        coinmate.start(config.exchanges[i]);
                    } else if(type === "STOP") {
                        await coinmate.stop();
                    }
                    break;
                case "ftx":
                    const ftx = require('./exchanges/ftx/');
                    if(type === "START"){
                        ftx.start(config.exchanges[i]);
                    } else if(type === "STOP") {
                        await ftx.stop();
                    }
                    break;
                case "itbit":
                    const itbit = require('./exchanges/itbit/');
                    if(type === "START"){
                        itbit.start(config.exchanges[i]);
                    } else if(type === "STOP") {
                        await itbit.stop();
                    }
                    break;
                case "kraken":
                    const kraken = require('./exchanges/kraken/');
                    if(type === "START"){
                        kraken.start(config.exchanges[i]);
                    } else if(type === "STOP") {
                        await kraken.stop();
                    }
                    break;
            }
        }
    }
    if(type === "STOP") {
        console.log('All child process finished. Let´s exit.');
        await db.updateCondition("safe_shutdown", 1);
        await db.close();
        process.exit();
    }
}

