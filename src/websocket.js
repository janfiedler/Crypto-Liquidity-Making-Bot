let socket_io = require('socket.io');
let io = socket_io();
let websocket = {};
let sockets = [];
let tools = require('./tools');
let db = require('../db/sqlite3');

websocket.io = io;

let setSocket = function (socket){
    sockets.push(socket);
};

let removeSocket = function (socket){
    let i = sockets.indexOf(socket);
    if(i !== -1) {
        sockets.splice(i, 1);
    }
};

websocket.emitPendingOrders = async function(data){
    if(sockets.length > 0){
        const po = await db.getAllPendingOrders(data.exchange, data.pair);
        const dailyProfit = await db.sumProfit(data.exchange, data.pair, new Date().toISOString().substr(0,10)+"%");
        if(dailyProfit.total === null){
            dailyProfit.total = 0;
        }
        let pendingOrders = [];
        for(let i=0;i<po.length;i++){
            const pl = tools.calculatePendingProfit(po[i].exchange, po[i], tools.takePipsFromPrice(data.tick.ask, 1, 16));
            pendingOrders.push({"buy_id": po[i].buy_id, "buy_price": po[i].buy_price, "sell_size": po[i].sell_size, "sell_target_price": po[i].sell_target_price, "pl": pl});
        }
        emitToAll("ticker", {"e": data.exchange, "p": data.pair, "t": data.tick, "dP": dailyProfit, "pO": pendingOrders});
    }
};

let emitToAll = function(event, data){
    if(sockets !== undefined) {
        sockets.forEach(function (socketSingle){
            socketSingle.emit(event, data);
        });
    }
};

io.on('connection', function (socket) {
    setSocket(socket);

    socket.on('disconnect', function(){
        removeSocket(socket);
    });
});

module.exports = websocket;
