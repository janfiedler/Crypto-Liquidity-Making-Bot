const config = require('../config');
const coinfalcon = require('../coinfalcon/api');
const coinmate = require('../coinmate/api');
const tools = require('../src/tools');

process.on('message', function() {
    async function getRates() {
        let myAccount = {coinfalcon: {balance: {},available: {}}, coinmate: {balance: {},available: {}}};
        console.log(config.exchanges.shift());
        console.log(config.exchanges["coinfalcon"].name);
        for (let key in config.exchanges.name) {
            console.log(key);
            tools.sleep(15000);
            switch(key.name){
                case "coinfalcon":
                    const balanceCoinfalcon = await coinfalcon.getAccountsBalance();
                    console.log(balanceCoinfalcon);
                    myAccount = await tools.parseBalance(balanceCoinfalcon.data, myAccount);
                    break;
                case "coinmate":
                    const balanceCoinmate = await coinmate.getAccountsBalance();
                    break;
            }
        }
        for(let i=0;i<Object.keys(config.exchanges).length;i++){

        }
        console.log(myAccount);
        //process.send({balanceCoinfalcon: balanceCoinfalcon, balanceCoinmate: balanceCoinmate});
    }
    getRates();
    //setInterval(getRates, 60000);
});