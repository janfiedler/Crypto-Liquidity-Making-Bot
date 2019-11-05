$( document ).ready(function() {
    let ws = io();
    let showAllOpenOrders = {};
    ws.on('ticker', function (data) {
        //console.log(data);
        let tbody = document.getElementById("tbody_" + data.e + "_" + data.p.n + "_" + data.p.i);
        //Init object if do not exist
        if (!showAllOpenOrders.hasOwnProperty("tbody_" + data.e + "_" + data.p.n + "_" + data.p.i)) {
            showAllOpenOrders["tbody_" + data.e + "_" + data.p.n + "_" + data.p.i] = false;
        }

        if (tbody){
            let tP = document.getElementById("totalProfit_" + data.e + "_" + data.p.n + "_" + data.p.i);
            $(tP).text(data.tP.toFixed(8) + ' ' + data.p.n.split(data.p.s)[1]);
            let dP = document.getElementById("dailyProfit_" + data.e + "_" + data.p.n + "_" + data.p.i);
            $(dP).text(data.dP.total.toFixed(8) + ' ' + data.p.n.split(data.p.s)[1]);
            let tS = document.getElementById("totalSize_" + data.e + "_" + data.p.n + "_" + data.p.i);
            $(tS).text(data.tS + ' ' + data.p.n.split(data.p.s)[0]);
            let tA = document.getElementById("amountSpent_" + data.e + "_" + data.p.n + "_" + data.p.i);
            if(data.fA > 0){
                $(tA).html(data.tA + ' <i title="Frozen amount" class="text-primary">('+ data.fA +')</i> ' +  ' / ' + data.mA+ ' ' + data.p.n.split(data.p.s)[1]);
            } else {
                $(tA).text(data.tA + ' / ' + data.mA + ' ' + data.p.n.split(data.p.s)[1]);
            }
            let rB = document.getElementById("rateBid_" + data.e + "_" + data.p.n + "_" + data.p.i);
            $(rB).text(data.t.bid + ' ' + data.p.n.split(data.p.s)[1]);
            let rA = document.getElementById("rateAsk_" + data.e + "_" + data.p.n + "_" + data.p.i);
            $(rA).text(data.t.ask + ' ' + data.p.n.split(data.p.s)[1]);

            $(tbody).find('tr').remove();
            let totalPl = 0;
            let totalOpenOrders = 0;
            let totalHiddenOrders = 0;
            data.pO.forEach(function(order){
                let plColor = "class='text-danger'";
                let ico_frozen = "<span class='freeze_order' title='Freeze order'></span>";
                if(order.pl > 0){
                    plColor = "class='text-success'";
                }
                if(order.f){
                    plColor = "class='text-primary'";
                    ico_frozen = "<span class='frozen_order'  title='Unfreeze order'></span>";
                }
                let ico_kill = "<span class='kill_order'  title='Kill order'></span>";
                if(order.sell_target_price === 0){
                    ico_kill = "<span class='kill_order_active'  title='Kill order active'></span>";
                }
                totalPl += order.pl;
                totalOpenOrders++;
                let trStyle = '';
                if(totalOpenOrders === 1 || totalOpenOrders === data.pO.length || order.pl > 0){
                    //Do something
                } else if(!showAllOpenOrders["tbody_" + data.e + "_" + data.p.n + "_" + data.p.i]) {
                    totalHiddenOrders++;
                    trStyle = "style='display: none'";
                    if(totalHiddenOrders === 1){
                        $(tbody).append('<tr class="hiddenOpenOrders"><td class="hiddenOpenOrdersCount"> '+totalHiddenOrders+'x more</td><td></td><td></td><td></td><td></td><td></td><td class="hiddenOpenOrdersShow">SHOW</td></tr>');
                        $(tbody).find(".hiddenOpenOrdersShow").click(function() {
                            showAllOpenOrders["tbody_" + data.e + "_" + data.p.n + "_" + data.p.i] = true;
                            $(tbody).find(".hiddenOpenOrders").remove();
                            $(tbody).find('tr').show();
                        });
                    } else {
                        $(tbody).find(".hiddenOpenOrdersCount").text(totalHiddenOrders+"x more");
                    }
                }
                $(tbody).append('<tr '+trStyle+'><td>'+order.buy_id+'</td><td>'+order.buy_price+'</td><td>'+order.sell_size+'</td><td>'+order.sell_target_price+'</td><td>'+order.oA+' '+data.p.n.split(data.p.s)[1]+'</td><td '+plColor+'><strong>'+order.pl+' '+data.p.n.split(data.p.s)[1]+'</strong></td><td id="'+order.buy_id+'" class="action">'+ico_frozen+ico_kill+'</td></tr>');
                if(totalOpenOrders === 1 || totalOpenOrders === data.pO.length){
                    $(tbody).find("tr").last().css("display: block;");
                }
            });
            $(tbody).append('<tr><td>'+totalOpenOrders+'x</td><td></td><td></td><td></td><td></td><td><strong>'+setPrecision(totalPl, data.d)+' '+data.p.n.split(data.p.s)[1]+'</strong></td><td></td></tr>');
        }
    });

    ws.on('filledBuyOrder', function (data) {
        console.log(data);
        let tbody = document.getElementById("tbody_filledBuyOrders");
        if (tbody){
            $(tbody).prepend('<tr title="'+new Date().toISOString()+'"><td>'+data.p.l+'</td><td>'+data.s+' '+data.p.n.split(data.p.s)[0]+'</td><td title="Currency: '+data.p.n.split(data.p.s)[1]+'">'+data.bP+'</td>><td title="Currency: '+data.p.n.split(data.p.s)[1]+'">'+data.sP+'</td><td title="Fee: '+data.f+'">'+setPrecision((data.s*data.bP), 16)+' '+data.p.n.split(data.p.s)[1]+'</td></tr>');
        }
    });

    ws.on('completedOrder', function (data) {
        console.log(data);
        let tbody = document.getElementById("tbody_completedOrders");
        if (tbody){
            let plColor = "class='text-danger'";
            if(data.oP > 0){
                plColor = "class='text-success'";
            }
            $(tbody).prepend('<tr title="'+new Date().toISOString()+'"><td>'+data.p.l+'</td><td>'+data.s+' '+data.p.n.split(data.p.s)[0]+'</td><td title="Fee: '+data.bF+' Currency: '+data.p.n.split(data.p.s)[1]+'">'+data.bP+'</td><td title="Fee: '+data.sF+' Currency: '+data.p.n.split(data.p.s)[1]+'">'+data.sP+'</td><td '+plColor+'>'+data.oP+' '+data.p.n.split(data.p.s)[1]+'</td></tr>');
        }
    });

    function freezeHandler(ev) {
        ev.preventDefault();

        const target = $(ev.target);
        const orderId = target.closest('td').attr('id');
        if( target.is(".freeze_order") ) {
            emitFreeze(ev, "freezeOrder", orderId);

        } else if( target.is(".frozen_order") ){
            emitFreeze(ev, "unfreezeOrder", orderId);
        }
    }
    $(this).on("click", ".freeze_order", freezeHandler);
    $(this).on("click", ".frozen_order", freezeHandler);

    function setPrecision(value, digits){
        return Math.round(value*Math.pow(10, digits))/Math.pow(10, digits);
    }

    function emitFreeze(event, type, id){
        ws.emit(type, {orderId:id}, function (data) {
            if (data.done) {
                //Remove selected tr row
                event.currentTarget.parentNode.parentElement.remove();
                console.log("Freeze Authorized");
            } else {
                console.log("Freeze Unauthorized");
            }
        });
    }

    function killHandler(ev){
        ev.preventDefault();
        const target = $(ev.target);
        const orderId = target.closest('td').attr('id');

        const confirmResponse =confirm("Are you sure with kill order id "+orderId+" ?");
        if(confirmResponse){
            emitKill(ev, "killOrder", orderId);
        }
    }
    $(this).on("click", ".kill_order", killHandler);

    function emitKill(event, type, id){
        ws.emit(type, {orderId:id}, function (data) {
            if (data.done) {
                //Remove selected tr row
                event.currentTarget.parentNode.parentElement.remove();
                console.log("Kill order Authorized");
            } else {
                console.log("Kill order Unauthorized");
            }
        });
    }
});