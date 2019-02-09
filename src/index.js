let config = require('../config');
let db = require('../db/sqlite3');

process.on('SIGINT', () => {
    handleWorkers("STOP");
});

// Init
(async function () {
    // Promise not compatible with config.debug && console.log, async is?
    await db.connect();
    await db.createTables();
    handleWorkers("START");
})();

async function handleWorkers(type){
    for(let i=0;i<config.exchanges.length;i++){
        if(config.exchanges[i].active) {
            config.exchanges[i].debug && console.log(config.exchanges[i].name+" "+type+" request");
            switch (config.exchanges[i].name) {
                case "coinfalcon":
                    const coinfalcon = require('../coinfalcon/');
                    if(type === "START"){
                        coinfalcon.start(config.exchanges[i]);
                    } else if(type === "STOP") {
                        await coinfalcon.stop();
                    }
                    break;
                case "coinmate":
                    const coinmate = require('../coinmate/');
                    if(type === "START"){
                        coinmate.start(config.exchanges[i]);
                    } else if(type === "STOP") {
                        await coinmate.stop();
                    }
                    break;
            }
        }
    }
    if(type === "STOP") {
        await db.close();
        console.log('All workers finished, lets kill self');
        process.exit();
    }
}

