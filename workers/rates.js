let config = require('../config');
const tools = require('../src/tools');
const coinfalcon = require('../coinfalcon');

process.on('message', function() {
    async function getRates() {
        config.debug && console.log(new Date().toISOString()+" await tools.getBitfinexTickers");
        const resultBitfinexTickers = await tools.getBitfinexTickers();
        const balance = await coinfalcon.getAccountsBalance();
        process.send({bitfinexTickers: resultBitfinexTickers, coinfalconBalance: balance});
    }
    getRates();
    setInterval(getRates, 60000);

});