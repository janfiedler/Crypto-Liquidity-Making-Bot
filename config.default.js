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
                        "moneyManagement": {
                            "autopilot": {
                                "active": false,
                                "minSize": 0.0002,
                                "budgetLimit": 1000
                            },
                            "buyPercentageAvailableBalance": {
                                "active": false,
                                "value": 1,
                                "budgetLimit": 1000
                            },
                            "buyForAmount": {
                                "active": true,
                                "value": 15,
                                "budgetLimit": 150
                            },
                            "buySize": {
                                "active": false,
                                "value": 0,
                                "bagHolderLimit": 0,
                                "budgetLimit": 0
                            },
                            "percentageProfitTarget": 0.5,
                            "pipsAskBidSpread": 1
                        },
                        "strategy": {
                            "ignoreOrderSize": 0.001,
                            "buySpread": {
                                "percentage": {
                                    "active": true,
                                    "value" : 0.05
                                },
                                "pips": {
                                    "active": false,
                                    "value": 2500
                                }
                            },
                            "sellOldestOrderWithLoss": false
                        }
                    },
                    {
                        "name": "BTC-EUR",
                        "id": 2,
                        "active": true,
                        "separator": "-",
                        "digitsPrice": 2,
                        "digitsSize": 8,
                        "moneyManagement": {
                            "autopilot": {
                                "active": false,
                                "minSize": 0.0002,
                                "budgetLimit": 1000
                            },
                            "buyPercentageAvailableBalance": {
                                "active": false,
                                "value": 1,
                                "budgetLimit": 1000
                            },
                            "buyForAmount": {
                                "active": true,
                                "value": 15,
                                "budgetLimit": 150
                            },
                            "buySize": {
                                "active": false,
                                "value": 0,
                                "bagHolderLimit": 0,
                                "budgetLimit": 0
                            },
                            "percentageProfitTarget": 0.5,
                            "pipsAskBidSpread": 1
                        },
                        "strategy": {
                            "ignoreOrderSize": 0.001,
                            "buySpread": {
                                "percentage": {
                                    "active": true,
                                    "value" : 0.05
                                },
                                "pips": {
                                    "active": false,
                                    "value": 2500
                                }
                            },
                            "sellOldestOrderWithLoss": false
                        }
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
                        "moneyManagement": {
                            "autopilot": {
                                "active": false,
                                "minSize": 0.0002,
                                "budgetLimit": 100000
                            },
                            "buyPercentageAvailableBalance": {
                                "active": true,
                                "value": 1,
                                "budgetLimit": 100000
                            },
                            "buyForAmount": {
                                "active": false,
                                "value": 1000,
                                "budgetLimit": 100000
                            },
                            "buySize": {
                                "active": false,
                                "value": 0,
                                "bagHolderLimit": 0,
                                "budgetLimit": 0
                            },
                            "percentageProfitTarget": 0.25,
                            "pipsAskBidSpread": 1
                        },
                        "strategy": {
                            "ignoreOrderSize": 0.001,
                            "buySpread": {
                                "percentage": {
                                    "active": true,
                                    "value" : 0.05
                                },
                                "pips": {
                                    "active": false,
                                    "value": 6000
                                }
                            },
                            "sellOldestOrderWithLoss": false
                        }
                    },
                    {
                        "name": "BTC_EUR",
                        "id": 2,
                        "active": true,
                        "separator": "_",
                        "digitsPrice": 2,
                        "digitsSize": 4,
                        "moneyManagement": {
                            "autopilot": {
                                "active": false,
                                "minSize": 0.0001,
                                "budgetLimit": 1000
                            },
                            "buyPercentageAvailableBalance": {
                                "active": true,
                                "value": 1,
                                "budgetLimit": 1000
                            },
                            "buyForAmount": {
                                "active": false,
                                "value": 10,
                                "budgetLimit": 1000
                            },
                            "buySize": {
                                "active": false,
                                "value": 0,
                                "bagHolderLimit": 0,
                                "budgetLimit": 0
                            },
                            "percentageProfitTarget": 0.25,
                            "pipsAskBidSpread": 1
                        },
                        "strategy": {
                            "ignoreOrderSize": 0.001,
                            "buySpread": {
                                "percentage": {
                                    "active": true,
                                    "value" : 0.05
                                },
                                "pips": {
                                    "active": false,
                                    "value": 2400
                                }
                            },
                            "sellOldestOrderWithLoss": false
                        }
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
                        "moneyManagement": {
                            "autopilot": {
                                "active": false,
                                "minSize": 0.001,
                                "budgetLimit": 0.011
                            },
                            "buyPercentageAvailableBalance": {
                                "active": false,
                                "value": 1,
                                "budgetLimit": 1
                            },
                            "buyForAmount": {
                                "active": true,
                                "value": 0.0011,
                                "budgetLimit": 0.011
                            },
                            "buySize": {
                                "active": false,
                                "value": 0,
                                "bagHolderLimit": 0,
                                "budgetLimit": 0
                            },
                            "percentageProfitTarget": 0.3,
                            "pipsAskBidSpread": 0.3
                        },
                        "strategy": {
                            "ignoreOrderSize": 0,
                            "buySpread": {
                                "percentage": {
                                    "active": true,
                                    "value" : 0.05
                                },
                                "pips": {
                                    "active": false,
                                    "value": 50
                                }
                            },
                            "sellOldestOrderWithLoss": false
                        }
                    },
                    {
                        "name": "BNB-BTC",
                        "id": 2,
                        "active": true,
                        "separator": "-",
                        "digitsPrice": 7,
                        "digitsSize": 2,
                        "moneyManagement": {
                            "autopilot": {
                                "active": false,
                                "minSize": 0.001,
                                "budgetLimit": 0.11
                            },
                            "buyPercentageAvailableBalance": {
                                "active": false,
                                "value": 1,
                                "budgetLimit": 1
                            },
                            "buyForAmount": {
                                "active": true,
                                "value": 0.0011,
                                "budgetLimit": 0.11
                            },
                            "buySize": {
                                "active": false,
                                "value": 0,
                                "bagHolderLimit": 0,
                                "budgetLimit": 0
                            },
                            "percentageProfitTarget": 0.3,
                            "pipsAskBidSpread": 0.3
                        },
                        "strategy": {
                            "ignoreOrderSize": 0,
                            "buySpread": {
                                "percentage": {
                                    "active": true,
                                    "value" : 0.05
                                },
                                "pips": {
                                    "active": false,
                                    "value": 50
                                }
                            },
                            "sellOldestOrderWithLoss": false
                        }
                    }
                ]
            }
        ]
    };
module.exports = config;
