let config =
    {
        "exchanges": [
            {
                "name": "coinfalcon",
                "url": "https://coinfalcon.com",
                "active": true,
                "debug": true,
                "CF_API_KEY": "",
                "CD_API_SECRET_KEY": "",
                "sleepPause": 225,
                "stickToBigOrders": false,
                "accounts": [{"name": "eur"}, {"name": "btc"}, {"name": "iot"}],
                "pairs": [
                    {
                        "name": "IOT-EUR",
                        "id": 1,
                        "active": true,
                        "separator": "-",
                        "digitsPrice": 4,
                        "digitsSize": 5,
                        "bagHolderLimit": 0,
                        "buySize": 0,
                        "budgetLimit": 0,
                        "buyForAmount": 10,
                        "ignoreOrderSize": 1,
                        "pipsAskBidSpread": 10,
                        "percentageProfitTarget": 0.12,
                        "pipsBuySpread": 10,
                        "sellOldestOrderWithLoss": false
                    },
                    {
                        "name": "BTC-EUR",
                        "id": 2,
                        "active": true,
                        "separator": "-",
                        "digitsPrice": 2,
                        "digitsSize": 8,
                        "bagHolderLimit": 0,
                        "buySize": 0,
                        "budgetLimit": 0,
                        "buyForAmount": 20,
                        "ignoreOrderSize": 0.0,
                        "pipsAskBidSpread": 100,
                        "percentageProfitTarget": 0.12,
                        "pipsBuySpread": 100,
                        "sellOldestOrderWithLoss": false
                    }
                ]
            },
            {
                "name": "coinmate",
                "url": "https://coinmate.io",
                "active": true,
                "debug": true,
                "privateKey": "",
                "publicKey": "",
                "clientId": "",
                "sleepPause": 650,
                "stickToBigOrders": false,
                "pusher": true,
                "accounts": [{"name": "BTC"}, {"name": "CZK"}],
                "pairs": [
                    {
                        "name": "BTC_CZK",
                        "id": 1,
                        "active": true,
                        "separator": "_",
                        "digitsPrice": 2,
                        "digitsSize": 4,
                        "bagHolderLimit": 0,
                        "buySize": 0,
                        "budgetLimit": 0,
                        "buyForAmount": 50,
                        "ignoreOrderSize": 0.0001,
                        "pipsAskBidSpread": 2500,
                        "percentageProfitTarget": 0.5,
                        "pipsBuySpread": 10000,
                        "sellOldestOrderWithLoss": false
                    },
                    {
                        "name": "BTC_EUR",
                        "id": 2,
                        "active": true,
                        "separator": "_",
                        "digitsPrice": 2,
                        "digitsSize": 4,
                        "bagHolderLimit": 0,
                        "buySize": 0,
                        "budgetLimit": 0,
                        "buyForAmount": 5,
                        "ignoreOrderSize": 0.0001,
                        "pipsAskBidSpread": 100,
                        "percentageProfitTarget": 0.5,
                        "pipsBuySpread": 500,
                        "sellOldestOrderWithLoss": false
                    }
                ]
            },
            {
                "name": "binance",
                "url": "https://api.binance.com",
                "active": true,
                "debug": true,
                "apiKey": "",
                "secretKey": "",
                "sleepPause": 250,
                "stickToBigOrders": false,
                "accounts": [{"name": "BTC"}, {"name": "IOTA"}, {"name": "BNB"}, {"name": "PIVX"}],
                "pairs": [
                    {
                        "name": "IOTA-BTC",
                        "id": 1,
                        "active": true,
                        "separator": "-",
                        "digitsPrice": 8,
                        "digitsSize": 0,
                        "bagHolderLimit": 400,
                        "buySize": 0,
                        "budgetLimit": 0,
                        "buyForAmount": 0.001,
                        "ignoreOrderSize": 0,
                        "pipsAskBidSpread": 1,
                        "percentageProfitTarget": 0.4,
                        "pipsBuySpread": 15,
                        "sellOldestOrderWithLoss": false
                    },
                    {
                        "name": "BNB-BTC",
                        "id": 2,
                        "active": true,
                        "separator": "-",
                        "digitsPrice": 7,
                        "digitsSize": 2,
                        "bagHolderLimit": 0.25,
                        "buySize": 0,
                        "budgetLimit": 0,
                        "buyForAmount": 0.001,
                        "ignoreOrderSize": 0,
                        "pipsAskBidSpread": 1,
                        "percentageProfitTarget": 0.2,
                        "pipsBuySpread": 40,
                        "sellOldestOrderWithLoss": false
                    },
                    {
                        "name": "PIVX-BTC",
                        "id": 3,
                        "active": true,
                        "separator": "-",
                        "digitsPrice": 7,
                        "digitsSize": 2,
                        "bagHolderLimit": 1,
                        "buySize": 0,
                        "budgetLimit": 0,
                        "buyForAmount": 0.001,
                        "ignoreOrderSize": 0,
                        "pipsAskBidSpread": 1,
                        "percentageProfitTarget": 0.5,
                        "pipsBuySpread": 10,
                        "sellOldestOrderWithLoss": false
                    }
                ]
            }
        ]
    };
module.exports = config;
