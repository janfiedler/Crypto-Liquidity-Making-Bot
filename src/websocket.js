let socket_io = require('socket.io');
let io = socket_io();
let websocket = {};
let sockets = [];

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

websocket.emitToAll = function(event, data){
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
