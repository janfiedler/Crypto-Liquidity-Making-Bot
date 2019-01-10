var request = require('request');

exports.getPriceIOTEUR = function() {
    return new Promise(function (resolve) {
        /* on trading pairs (ex. tBTCUSD)
        [
          BID,
          BID_SIZE,
          ASK,
          ASK_SIZE,
          DAILY_CHANGE,
          DAILY_CHANGE_PERC,
          LAST_PRICE,
          VOLUME,
          HIGH,
          LOW
        ]
        */
        request.get({url: "https://api.bitfinex.com/v2/ticker/tIOTEUR"}, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                resolve({s:true, body:JSON.parse(body)});
            } else {
                console.log(body);
                console.error(error);
                resolve({s:false, body:error});
            }
        });
    });
};