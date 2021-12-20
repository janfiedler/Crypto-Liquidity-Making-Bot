const tools = require('../../tools');
let config;
const WebSocket = require("ws");
let ws = null;
let webSocketUrl = "wss://ftx.com/ws/";

let websocket_order_book = [];
let order_book = [];

let initWebSocketConnection = function (){
    return new Promise(function (resolve) {
        //Create the WebSocket object
        ws = new WebSocket(webSocketUrl);

        ws.on('open', async function open() {
            console.log("Connected to websocket server at: " + webSocketUrl);
            ws.isAlive = true;
            await handleWebSocketSubscription("subscribe");
            resolve(true);
        });

        ws.on('message', function incoming(data) {
            parseWebSocketData(data);
        });

    });
}

let handleWebSocketSubscription = function (type){
    if(type === "subscribe"){
        for(let i=0;i<config.pairs.length;i++){
            if(config.pairs[i].active.buy || config.pairs[i].active.sell){
                if(typeof websocket_order_book[config.pairs[i].name] === 'undefined'){
                    websocket_order_book[config.pairs[i].name] = true;
                    console.log("Subscribe order book for " + config.pairs[i].name);
                    webSocketEmit("subscribe", "orderbook", config.pairs[i].name);
                }
            }
        }
    } else if(type === "unsubscribe"){
        for(let i=0;i<Object.keys(websocket_order_book).length;i++){
            console.log("Unsubscribe order book for " + Object.keys(websocket_order_book)[i]);
            webSocketEmit("unsubscribe", "orderbook", Object.keys(websocket_order_book)[i]);
        }
    }

}

function updateOrderBook(snapshot, updates) {
    for (const update of updates){
        const found = snapshot.findIndex(element => element[0] === update[0]);
        if(found !== -1){
            if(update[1] === 0){
                snapshot.splice(found, 1);
            } else {
                snapshot[found][1] = update[1];
            }
        } else {
            snapshot.push(update);
        }
    }
    return snapshot;
}

let parseWebSocketData = function (data){
    try {
        const message = JSON.parse(data);
        //console.log(message);
        if(message.hasOwnProperty('type') && message.hasOwnProperty('channel')){
            if(message.channel === "orderbook"){
                if(message.type === "partial"){
                    order_book[message.market] = message.data;

                } else if(message.type === "update"){
                    if(message.data.bids.length > 0){
                        order_book[message.market].bids = updateOrderBook(order_book[message.market].bids, message.data.bids);
                    }
                    if(message.data.asks.length > 0){
                        //console.log(message.data.asks);
                        order_book[message.market].asks = updateOrderBook(order_book[message.market].asks, message.data.asks);
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
        console.error(data);
    }
}

let cancelWebSocketConnection = function (){
    return new Promise(async function (resolve) {
        if(ws.isAlive){
            console.log("Canceling connection to websocket server at: " + webSocketUrl);
            await handleWebSocketSubscription("unsubscribe");
            if (ws.isAlive){
                ws.close();
            }
            ws.on('close', function close() {
                console.log("Disconnected to websocket server at: " + webSocketUrl);
                ws.isAlive = false;
                websocket_order_book = null;
                resolve(true);
            });
        }
    });
}

let webSocketEmit = function (op, channel, market){
    ws.send(JSON.stringify({op, channel, market}));
}

let setConfig = function(data){
    config = data;
};

module.exports = {
    webSocketEmit,
    setConfig,
    initWebSocketConnection,
    cancelWebSocketConnection
};