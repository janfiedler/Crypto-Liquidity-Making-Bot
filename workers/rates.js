let config = require('../config');
const tools = require('../src/tools');
const coinfalcon = require('../coinfalcon');

process.on('message', function() {
    async function getRates() {
        const balance = await coinfalcon.getAccountsBalance();
        process.send({coinfalconBalance: balance});
    }
    getRates();
    setInterval(getRates, 60000);
});