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
        const po = await db.getAllSellOrders(data.exchange, data.pair.name, data.pair.id);
        const tS = await db.getTotalSellSize(data.exchange, {"name": data.pair.name, "id": data.pair.id, "digitsSize": data.pair.digitsSize});

        const dailyProfit = await db.sumProfit(data.exchange, data.pair.name, data.pair.id, new Date().toISOString().substr(0,10)+"%");
        if(dailyProfit.total === null){
            dailyProfit.total = 0;
        }
        let pendingOrders = [];
        let totalAmount = 0;
        for(let i=0;i<po.length;i++){
            const orderAmount = (po[i].buy_price * po[i].sell_size);
            totalAmount += orderAmount;
            const pl = tools.calculatePendingProfit(po[i].exchange, po[i], tools.takePipsFromPrice(data.tick.ask, 1, data.pair.digitsPrice));
            pendingOrders.push({"buy_id": po[i].buy_id, "buy_price": po[i].buy_price, "sell_size": po[i].sell_size, "sell_target_price": tools.setPrecision(po[i].sell_target_price, data.pair.digitsPrice), "pl": tools.setPrecision(pl, data.pair.digitsPrice), "oA": tools.setPrecision(orderAmount, data.pair.digitsPrice)});
        }
        emitToAll("ticker", {"e": data.exchange, "p": {"n": data.pair.name, "i": data.pair.id, "s":data.pair.separator}, "tS": tS, "tA": tools.setPrecision(totalAmount, data.pair.digitsPrice), "t": data.tick, "dP": dailyProfit, "pO": pendingOrders});
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
