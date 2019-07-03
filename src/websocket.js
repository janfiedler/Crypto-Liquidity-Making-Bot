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
            const pl = tools.calculatePendingProfit(po[i], tools.takePipsFromPrice(data.tick.ask, 1, data.pair.digitsPrice+2));
            pendingOrders.push({"buy_id": po[i].buy_id, "buy_price": po[i].buy_price, "sell_size": tools.setPrecision(po[i].sell_size, data.pair.digitsSize), "sell_target_price": tools.setPrecision(po[i].sell_target_price, data.pair.digitsPrice), "pl": tools.setPrecision(pl, data.pair.digitsPrice+2), "oA": tools.setPrecision(orderAmount, data.pair.digitsPrice), "f": po[i].frozen});
        }
        let budgetLimit = 0;
        if(data.pair.moneyManagement.autopilot.active){
            budgetLimit = data.pair.moneyManagement.autopilot.budgetLimit;
        } else if(data.pair.moneyManagement.buyPercentageAvailableBalance.active){
            budgetLimit = data.pair.moneyManagement.buyPercentageAvailableBalance.budgetLimit;
        } else if(data.pair.moneyManagement.buyPercentageAvailableBudget.active){
            budgetLimit = data.pair.moneyManagement.buyPercentageAvailableBudget.budgetLimit;
        } else if (data.pair.moneyManagement.buyForAmount.active){
            budgetLimit = data.pair.moneyManagement.buyForAmount.budgetLimit;
        } else if (data.pair.moneyManagement.buySize.active){
            budgetLimit = data.pair.moneyManagement.buySize.budgetLimit;
        }
        emitToAll("ticker", {"e": data.exchange, "p": {"n": data.pair.name, "i": data.pair.id, "s":data.pair.separator}, "tS": tS, "tA": tools.setPrecision(totalAmount, data.pair.digitsPrice), "d": data.pair.digitsPrice+2, "mA": budgetLimit , "t": data.tick, "dP": dailyProfit, "pO": pendingOrders});
    }
};

websocket.emitCompletedOrder = async function(data){
    if(sockets.length > 0){
        emitToAll("completedOrder", {"p": {"n": data.pair.name, "l": data.order.exchange+" "+data.order.pair+" #"+data.order.pair_id, "s":data.pair.separator}, "s": data.order.sell_filled, "oP": data.profit});
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

    socket.on('freezeOrder', async function (data, fn) {
        const resultFreeze = await db.setFreeze(data.orderId, 1);
        fn({done:resultFreeze});
    });

    socket.on('unfreezeOrder', async function (data, fn) {
        const resultFreeze = await db.setFreeze(data.orderId, 0);
        fn({done:resultFreeze});
    });

    socket.on('killOrder', async function (data, fn) {
        const resultKill = await db.killOrder(data.orderId);
        fn({done:resultKill});
    });
});

module.exports = websocket;
