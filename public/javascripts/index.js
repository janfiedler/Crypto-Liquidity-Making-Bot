$( document ).ready(function() {
    let ws = io();
    ws.on('ticker', function (data) {
        console.log(data);
        let tbody = document.getElementById("tbody_" + data.e + "_" + data.p + "_" + data.i);
        if (tbody){
            let dP = document.getElementById("dailyProfit_" + data.e + "_" + data.p + "_" + data.i);
            $(dP).text(data.dP.total.toFixed(4) + ' ' + data.p.substring(4));
            let tS = document.getElementById("totalSize_" + data.e + "_" + data.p + "_" + data.i);
            $(tS).text(data.tS + ' ' + data.p.substring(0, 3));
            let rB = document.getElementById("rateBid_" + data.e + "_" + data.p + "_" + data.i);
            $(rB).text('Bid: ' + data.t.bid + ' ' + data.p.substring(4));
            let rA = document.getElementById("rateAsk_" + data.e + "_" + data.p + "_" + data.i);
            $(rA).text('Ask: ' + data.t.ask + ' ' + data.p.substring(4));

            $(tbody).find('tr').remove();
            data.pO.forEach(function(order){
                let plColor = "class='text-danger'";
                if(order.pl > 0){
                    plColor = "class='text-success'";
                }
                $(tbody).append('<tr><td>'+order.buy_id+'</td><td>'+order.buy_price+'</td><td>'+order.sell_size+'</td><td>'+order.sell_target_price+'</td><td '+plColor+'><strong>'+order.pl+' '+data.p.substring(4)+'</strong></td><td></td></tr>');
            });
        }
    });
});