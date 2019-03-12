$( document ).ready(function() {
    let ws = io();
    ws.on('ticker', function (data) {
        console.log(data);
    });
});