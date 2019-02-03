let cp = require('child_process');
let coinmateWorker = cp.fork('coinmate/worker.js');

let config;
let db;

let init = function(configuration, database){
    config = configuration;
    db = database;
    coinmateWorker.send({"type": "init", "config": config});
};


coinmateWorker.on('message', async function (data) {
    switch (data.type) {
        case "init":
            if(data.success){

            }
            break;
    }
});

module.exports = {
    init: init
};