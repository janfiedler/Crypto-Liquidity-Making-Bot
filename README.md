# Crypto-Liquidity-Making-Bot
Liquidity Making Bot for CryptoCurrency Exchanges
- https://coinmate.io
- https://coinfalcon.com/

*Use crypto liquidity making bot at your own risk.*

- ***Dangers of Scalping:***
    - Price drastically increases
    - Price drastically decreases
    - Fees eat entire profit

>*Bot trading core is working, but still in alpha stage with a missing a lot of additional functions for better user experience. The documentation contains only basics, this will be improved in the future. You are welcome to contact me via issues section.*

## Strategy
This bot follows simple scalping strategy buy low, sell high and does not sell at a loss.* Focusing on very small profits with a lot of trades without leverage.

>** Optional option keeping currency until selling target price will be reach. Recommended only with currency you trust there will be exist in future. Until then you are HODLER.*

Bot looking for ask/bid price to tickers (orders on exchange) based on strategy. In the config file, you have the option to make small changes in strategy for every trading pair. Strategy goal is always offer better price for bid (buy) and cheaper price for ask (sell) than marked orders.

For example if target price is selected by strategy as:
 * ASK: 3441.39 BTC/EUR. Bot will offer 3441.38 BTC/EUR
 * BID: 3438.12 BTC/EUR. Bot will offer 3438.13 BTC/EUR
 
### Rules
1. Only one buy limit order at the time.
    1. Size is equal to the parameter "buySize" or "buyForAmount".
    2. Buy only for a lower price than previous filled order.
    3. Following strategy rule with parameter "pipsBuySpread".

2. If buy limit order is partially filled or fulfilled then is in local database switched to pending sell order with that bought size and target price calculated from defined by parameter "percentageProfitTarget".

3. The pending sell order is opened as sell limit order on the exchange if actual cheapest (lowest) ask price in orders book is higher than our selling target price.
    1. Then bot will start to offer this specific order at cheaper price followed by strategy defined by parameters "ignoreOrderSize" and "pipsAskBidSpread". 
    2. Only one sell limit order on exchange at the time. Even if the target price meet more pending sell orders. They must sell one by one. For case, if the price still going up, we do not worry about we sell something for the lower price. And bot can sell rest of currency for a better price.
    
4. If sell limit order is partially filled, actual local order is marked as completed and the rest of the resources are reopened as a new pending sell order. Now we have all the data needed to calculate the profit.

5. If sell limit order is fulfilled then order is marked as completed. Now we have all the data needed to calculate the profit. New cycle begins.
 
### Lifecycle
For every exchange setting is defined own worker (child process). So bot can handle multiple exchanges without blocking.
> Lifecycle begin with processing ASK orders of trading pairs current worker.
#### ASK process
1. Get from database details of lowest filled buy order. 
    > If not found, round ends and skipping actual loop with continue function.
2. Get from database details of opened order.
3. Get actual orders (tickers) on exchange.
    > api.getTicker(pair.name)
4. Parse tickers from exchange to unity format for strategy.    
5. Call function findSpotForAskOrder.
    > Find target ask price for this round based on actual conditions on the exchange.
6. validateOrder function
    
    Called only if target ask price changed. The order is always canceled before validating. Validating has three states.
    1. if(orderDetail.size_filled === 0)   
        > The order has not filled, set sell status as pending and open with a new target price.
    2. if(orderDetail.size_filled === orderDetail.size)
        > The order was Fulfilled. At this point, the order is marked as completed. Check your profits.
    3.  if(orderDetail.size_filled < orderDetail.size)
        > The order was partially filled. Partially filled size is marked as completed and the rest of the resources are reopened as a new pending sell order.
7.
    1. If the order was canceled, strategy continues with processing (opening) new ask order.
    2. If the order was fulfilled or partially filled this round is completed. The new order will process in the new round.
    

#### BID process
1. Get from database details of lowest filled buy order.
2. Get from database details of opened order. 
3. Get actual orders (tickers) on exchange.
    > api.getTicker(pair.name)
4. Parse tickers from exchange to unity format for strategy.    
5. Call function findSpotForBidOrder.
    > Find target bid price for this round based on actual conditions on the exchange.
6. validateOrder function
    
    Called only if target bid price changed. The order is always canceled before validating. Validating has three states.
    1. if(orderDetail.size_filled === 0)   
        > The order has not filled, set sell status as pending and open with a new target price.
    2. if(orderDetail.size_filled === orderDetail.size)
        > The order was Fulfilled. Status is now sell stage (pending sell order), buy order part marked as finished. 
    3.  if(orderDetail.size_filled < orderDetail.size)
        > The order was partially filled. Partially filled buy order is marked as finished. Partially filled size is set as pending sell order.
7.
    1. If the order was canceled, strategy continues with processing (opening) new bid order.
    2. If the order was fulfilled or partially filled this round is completed. The new order will process in the new round.
    
## Installation
Requires [Node.js®](https://nodejs.org/en/) to be installed. Tested on 10.15.1 LTS version.
```
git clone git@github.com:janfiedler/Crypto-Liquidity-Making-Bot.git
git checkout alpha_0.x.x
cd CryptoLiquidityMakingBot
```

#### Install package dependencies
```
npm install
```
#### How start after setup config.js
pm2:
```
pm2 start ecosystem.config.js
```
> Need start via ecosystem.config.js to set parameter kill_timeout. Without this parameter will pm2 forcefully kill application before properly finishing.

node:
```
node bin/www
```
#### How finish bot correctly
pm2:
```
pm2 stop bot
```
node:
```
ctrl+c or send SIGINT signal
```
All workers must finish their round, write the last status to the database and close self. Then will application stop. If you interrupt this process (mistake, crash pc/server, ..) is a big chance your database is not synced with actual open orders on the exchange. In this case, the application will not start. You must do a manual correction for now.

### Configuration
First step copy config template file as config.js
```
cp config.default.js config.js
```

Each object in array "exchanges" represent setting for specific exchange

```json
{"exchanges": [
  {"name": "coinfalcon",
        "url": "https://coinfalcon.com",
        "active": true,
        "debug": true,
        "CF_API_KEY": "",
        "CD_API_SECRET_KEY": "",
        "sleepPause": 225,
        "stickToBigOrders": false,
        "accounts": [{"name":"eur"},{"name":"btc"},{"name":"iot"}],
        "pairs": [
          {"name": "IOT-EUR",
           "separator": "-", 
           "digitsPrice": 4, 
           "digitsSize": 5, 
           "buySize": 0, 
           "buyForAmount": 10, 
           "ignoreOrderSize": 1, 
           "pipsAskBidSpread": 10, 
           "percentageProfitTarget": 0.12, 
           "pipsBuySpread": 10}, 
          {"name": "BTC-EUR", 
            "separator": "-", 
            "digitsPrice": 2, 
            "digitsSize": 8, 
            "buySize": 0, 
            "buyForAmount": 20, 
            "ignoreOrderSize": 0.0, 
            "pipsAskBidSpread": 100, 
            "percentageProfitTarget": 0.12, 
            "pipsBuySpread": 100}
        ]
    },
    {"name": "coinmate",
        "url": "https://coinmate.io",
        "active": true,
        "debug": true,
        "privateKey": "",
        "publicKey": "",
        "clientId": "",
        "sleepPause": 625,
        "stickToBigOrders": false,
        "accounts": [{"name":"BTC"},{"name":"CZK"}],
        "pairs": [
          {"name": "BTC_CZK", 
            "separator": "_", 
            "digitsPrice": 2, 
            "digitsSize": 4, 
            "buySize": 0, 
            "buyForAmount": 50, 
            "ignoreOrderSize": 0.0001, 
            "pipsAskBidSpread": 2500, 
            "percentageProfitTarget": 0.5, 
            "pipsBuySpread": 10000},
          {"name": "BTC_EUR", 
            "separator": "_", 
            "digitsPrice": 2, 
            "digitsSize": 4, 
            "buySize": 0, 
            "buyForAmount": 5, 
            "ignoreOrderSize": 0.0001, 
            "pipsAskBidSpread": 100, 
            "percentageProfitTarget": 0.5, 
            "pipsBuySpread": 500}
        ]
    }
]}
```

* "active": true,

```
You can disable / active bot for this exchange
true: active
false: disabled
```

* "debug": true,
```
You can disable / active details log with bot progress
```

* API coinfalcon details
```
"CF_API_KEY": "",
"CD_API_SECRET_KEY": "",
```        

* API coinmate details
```
"privateKey": "",
"publicKey": "",
"clientId": "",
```    

* "sleepPause": 225,
```
Every exchange has API request limits per seconds or minutes. This is coefficient for every API call per one trade round how long wait before continue to avoid ban your IP. Do not change this value to a lower number.
``` 

* "stickToBigOrders": false,
```
This is part of the strategy. If true, the bot will take as spot price (for obtaining target price) only from order, where size is bigger than two next orders. This is one strategy how to follow big orders. You get less filled trades, but you maybe get a fair price, because more traders think this is a good price for sell/buy order (support/resistance levels).
```

* "accounts": [{"name":"eur"},{"name":"btc"},...],
```
Bot on beginning fetches your balances from the exchange. He will remember only accounts what you define and what you will trade in pairs. Every exchange uses different names/letter case.
```

* "pairs": [
```
The object with setting for trading pair. Add a new object with your favorite pair what you won't be traded by the bot.
```

* "name": "BTC-EUR"
```
Every object starts with the name of the pair defined by the exchange. You need to find how is called your favorite pair, or use predefined format and just exchange names and keep separator.
```

* "separator": "-"
```
Every exchange uses a different separator for define trading pair. This setting is for a split function to fetch the right available/balance data from the account. You don't need to change this setting.
```

* "digitsPrice": 2
```
Define decimal precision of price for trading pair on the exchange.
For example, if BTC-EUR  on coinfalcon exchange has the price for 3457.00 than digits for the price is 2 because of 2 decimal precision.
```

* "digitsSize": 8
```
Define decimal precision of order size in orders book.
For example, if BTC-EUR on coinfalcon exchange has 0.34681000 you need set 8 because of 8 decimal precision in order size.
```

* "buySize": 0
```
How big size of orders you want open with every buy limit order? Set minimum allowed order size of trading pair on the exchange. 
* This is a good option when you want open only the smallest allowed size of the order.

If you set 0, than "buyForAmount" will be used instead.
```

* "buyForAmount": 10,
```
Most of the time is better for long term strategy buys for the same amount of currency. So size will be different, but every time for the same cost of your based currency (Based currency is on the second position in pair).
If you trading BTC-EUR, size order will be always close to 10 EUR.
```

* "ignoreOrderSize": 0.0999
```
Some other traders try to manipulate the market by putting small size order to force your order to disadvantageous price. You can set what size in orders book will be ignored when strategy finding target price for your order.
```

* "pipsAskBidSpread": 10,
```
Pip is representing the smallest unit of the ticker. So if the price in the order book is for BTC-EUR 3466.73, then pip is 0.01 EUR.

In all cases, you want to make only Maker trades. If your ask/buy order is to close at opposite limit order on the exchange, there is a risk before bot put your order at the market. There will be already the opposite order and you will take order instead to make one. For this situation, if your target price is close then your target price is changed to follow ask-bid spread rule.

Example BTC-EUR, pipsAskBidSpread": 100:
ASK: 3465.30
BID: 3465.10
Your target price founded by strategy will be 3465.11, but following this parameter, your buy order cannot be bigger than 3464.30. So your target price will move to this price level, to protect you.
```

* "percentageProfitTarget": 0.24
```
Define your profit in percentage. More trades you want make, make your profit smaller. But never lower than fees can be. Don't forget count fee for buy and sell order together.

For example, if the fee for market maker trade is 0,12% your profit target must be double and more.
Don't forget count with the situation when your order will be for market taker fee. Cover this situation you can set your profit target as doubled market taker fee.
```

* "pipsBuySpread": 1
```
This parameter will help you handle money management. You need define spread for new buy order from price of already filled buy order.
Example BTC-EUR, pipsBuySpread": 1:
Your last order was filled for 3465.10, next buy order can be only for 3465.09 and lower.

This parameter combined with buySize/buyForAmount define how much orders with your balance can strategy handle before bot stop trading. In the best scenario, this never happened only if the market drops a lot.
Then you have option add more funds to your exchange, or use (not existed yet) function for "close" oldest order in lose and funds used for a new order.
 
If the drop is so big for example from 19000 USD to 3200 USD, why still hodl older order, when you can use those funds to make so many flips and make some profits back. This option will be manual. Or automated only if previous profits cover loose from closed lose order.
```

### Known bugs
Due to API request limits, accounts balance/available is requested only on start. Than is maintained locally based on open, close, filled state. After some time bot will stop trading due to negative available funds (false statement). You need to restart the application.

#### License
Released under the [MIT License](LICENSE).