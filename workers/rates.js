const coinfalcon = require('../coinfalcon/api');
const coinmate = require('../coinmate/api');

process.on('message', function() {
    async function getRates() {
        const balanceCoinfalcon = await coinfalcon.getAccountsBalance();
        const balanceCoinmate = await coinmate.getBalance();
        process.send({balanceCoinfalcon: balanceCoinfalcon, balanceCoinmate: balanceCoinmate});
    }
    getRates();
    setInterval(getRates, 60000);
});