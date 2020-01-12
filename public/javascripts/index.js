$( document ).ready(function() {
    let ws = io();
    let showAllOpenOrders = {};
    ws.on('ticker', function (data) {
        //console.log(data);
        let tbody = document.getElementById("tbody_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
        //Init object if do not exist
        if (!showAllOpenOrders.hasOwnProperty("tbody_" + data.p.e + "_" + data.p.n + "_" + data.p.i)) {
            showAllOpenOrders["tbody_" + data.p.e + "_" + data.p.n + "_" + data.p.i] = false;
        }

        if (tbody){
            const totalDigits = (window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"] + window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"]);
            /*
            console.log(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"]);
            console.log(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]);
            console.log(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"]);
            */
            let tP = document.getElementById("totalProfit_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            if(tP){
                $(tP).text(data.tP.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: totalDigits
                }) + ' ' + data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]);
                let dP = document.getElementById("todayProfit_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
                $(dP).text(data.dP.total.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: totalDigits
                }) + ' ' + data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]);
            }
            let tS = document.getElementById("totalSize_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            $(tS).text(data.tS + ' ' + data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[0]);
            let tA = document.getElementById("amountSpent_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            if(data.fA > 0){
                $(tA).html(data.tA.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
                }) + ' <i title="Frozen amount" class="text-primary">('+ data.fA.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
                }) +')</i> ' +  ' / ' + data.mA+ ' ' + data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]);
            } else {
                $(tA).text(data.tA.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
                }) + ' / ' + data.mA + ' ' + data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]);
            }
            let rB = document.getElementById("rateBid_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            $(rB).text(data.t.bid + ' ' + data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]);
            let rA = document.getElementById("rateAsk_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            $(rA).text(data.t.ask + ' ' + data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]);

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
                totalPl += parseFloat(order.pl);
                totalOpenOrders++;
                let trStyle = '';
                if(totalOpenOrders === 1 || totalOpenOrders === data.pO.length || order.pl > 0){
                    //Do something
                } else if(!showAllOpenOrders["tbody_" + data.p.e + "_" + data.p.n + "_" + data.p.i]) {
                    totalHiddenOrders++;
                    trStyle = "style='display: none'";
                    if(totalHiddenOrders === 1){
                        $(tbody).append('<tr class="hiddenOpenOrders"><td class="hiddenOpenOrdersCount"> '+totalHiddenOrders+'x more</td><td></td><td></td><td></td><td></td><td></td><td class="hiddenOpenOrdersShow">SHOW</td></tr>');
                        $(tbody).find(".hiddenOpenOrdersShow").click(function() {
                            showAllOpenOrders["tbody_" + data.p.e + "_" + data.p.n + "_" + data.p.i] = true;
                            $(tbody).find(".hiddenOpenOrders").remove();
                            $(tbody).find('tr').show();
                        });
                    } else {
                        $(tbody).find(".hiddenOpenOrdersCount").text(totalHiddenOrders+"x more");
                    }
                }
                $(tbody).append('<tr '+trStyle+'><td>'+order.buy_id+'</td><td>'+order.buy_price.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
                })+'</td><td>'+order.sell_size.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"]
                })+'</td><td>'+order.sell_target_price.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
                })+'</td><td>'+order.oA.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
                })+' '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]+'</td><td '+plColor+'><strong>'+order.pl.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: totalDigits
                })+' '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]+'</strong></td><td id="'+order.buy_id+'" class="action">'+ico_frozen+ico_kill+'</td></tr>');
                if(totalOpenOrders === 1 || totalOpenOrders === data.pO.length){
                    $(tbody).find("tr").last().css("display: block;");
                }
            });
            $(tbody).append('<tr><td>'+totalOpenOrders+'x</td><td></td><td></td><td></td><td></td><td><strong>'+totalPl.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: totalDigits
            })+' '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]+'</strong></td><td></td></tr>');
        }
    });

    ws.on('filledBuyOrder', function (data) {
        //console.log(data);
        let tbody = document.getElementById("tbody_filledBuyOrders");
        if (tbody){
            $(tbody).prepend('<tr title="Exchange: '+data.p.e+' at '+new Date().toISOString()+'"><td>'+data.p.n+" #"+data.p.i+'</td><td>'+data.s.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"]
            })+' '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[0]+'</td><td title="Currency: '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]+'">'+data.bP.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
            })+'</td>><td title="Currency: '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]+'">'+data.sP.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
            })+'</td><td title="Fee: '+data.f+'">'+(data.s*data.bP).toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
            })+' '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]+'</td></tr>');
        }
    });

    ws.on('completedOrder', function (data) {
        //console.log(data);
        let tbody = document.getElementById("tbody_completedOrders");
        if (tbody){
            let plColor = "class='text-danger'";
            if(data.oP > 0){
                plColor = "class='text-success'";
            }
            $(tbody).prepend('<tr title="Exchange: '+data.p.e+' at '+new Date().toISOString()+'"><td>'+data.p.n+" #"+data.p.i+'</td><td>'+data.s.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"]
            })+' '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[0]+'</td><td title="Fee: '+data.bF+' Currency: '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]+'">'+data.bP.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
            })+'</td><td title="Fee: '+data.sF+' Currency: '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]+'">'+data.sP.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]
            })+'</td><td '+plColor+'>'+data.oP.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: (window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"] + window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"])
            })+' '+data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1]+'</td></tr>');
        }
    });

    function freezeHandler(ev) {
        ev.preventDefault();

        const target = $(ev.target);
        const orderId = target.closest('td').attr('id');
        //Remove buttons in action before confirmation and reload
        target.closest('td').html("");
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