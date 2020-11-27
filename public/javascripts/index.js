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
            const pairSellUnit = data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1];
            /*
            console.log(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"]);
            console.log(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]);
            console.log(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"]);
            */
            let tP = document.getElementById("totalProfit_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            if(data.tP){
                $(tP).html(convertToLocaleString(data.tP, pairSellUnit, true, 0, totalDigits));
                //Daily profit
                let dP = document.getElementById("todayProfit_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
                $(dP).html('<span title="Fees: ' + convertToLocaleString(data.dF, pairSellUnit, true, 0, totalDigits) + '">' + convertToLocaleString(data.dP, pairSellUnit, true, 0, totalDigits) + '</span> / '+ getPercentageValue((data.dP*365), data.tA, "floor", 2)+'% / '+ getPercentageValue((data.dP*365), data.mA, "floor", 2)+'%');
                //Monthly profit
                let mP = document.getElementById("monthlyProfit_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
                $(mP).html('<span title="Fees: ' + convertToLocaleString(data.mF, pairSellUnit, true, 0, totalDigits)+ '">' + convertToLocaleString(data.mP, pairSellUnit, true, 0, totalDigits) + ' </span> / '+ getPercentageValue((data.mP*12), data.tA, "floor", 2)+'% / '+ getPercentageValue((data.mP*12), data.mA, "floor", 2)+'%');
                //Yearly profit
                let yP = document.getElementById("yearlyProfit_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
                $(yP).html('<span title="Fees: ' + convertToLocaleString(data.yF, pairSellUnit, true, 0, totalDigits) + '">' + convertToLocaleString(data.yP, pairSellUnit, true, 0, totalDigits) + ' </span>/ '+ getPercentageValue(data.yP, data.tA, "floor", 2)+'% / '+ getPercentageValue(data.yP, data.mA, "floor", 2)+'%');

            }
            let tS = document.getElementById("totalSize_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            if(data.fS > 0){
                $(tS).html(data.tS + ' ' + ' <i title="Frozen size" class="text-primary">('+ convertToLocaleString(data.fS, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"]) +')</i> ' + data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[0]);
            } else {
                $(tS).text(data.tS + ' ' + data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[0]);
            }

            let tA = document.getElementById("amountSpent_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            if(data.fA > 0){
                $(tA).html(convertToLocaleString(data.tA, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]) + ' <i title="Frozen amount" class="text-primary">('+convertToLocaleString(data.fA, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]) +')</i> ' +  ' / ' + data.mA+ ' ' + pairSellUnit);
            } else {
                $(tA).html(convertToLocaleString(data.tA, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]) + ' / ' + data.mA + ' ' + pairSellUnit);
            }

            let rB = document.getElementById("rateBid_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            $(rB).text(data.t.bid + ' ' + pairSellUnit);
            let rA = document.getElementById("rateAsk_" + data.p.e + "_" + data.p.n + "_" + data.p.i);
            $(rA).text(data.t.ask + ' ' + pairSellUnit);

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
                $(tbody).append('<tr '+trStyle+'><td>'+order.buy_id+'</td><td>'
                    + convertToLocaleString(order.buy_price, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]) + '</td><td>'
                    + convertToLocaleString(order.sell_size, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"]) + '</td><td>'
                    + convertToLocaleString(order.sell_target_price, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]) + '</td><td>'
                    + convertToLocaleString(order.oA, pairSellUnit, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"]) + '</td><td '+plColor+'><strong>'
                    + convertToLocaleString(order.pl, pairSellUnit, true, 0, totalDigits) + '</strong></td><td id="'+order.buy_id+'" class="action">'+ico_frozen+ico_kill+'</td></tr>');

                if(totalOpenOrders === 1 || totalOpenOrders === data.pO.length){
                    $(tbody).find("tr").last().css("display: block;");
                }
            });
            $(tbody).append('<tr><td>'+totalOpenOrders+'x</td><td></td><td></td><td></td><td></td><td><strong>' + convertToLocaleString(totalPl, pairSellUnit, true, 0, totalDigits) + '</strong></td><td></td></tr>');

        }
    });

    ws.on('filledBuyOrder', function (data) {
        //console.log(data);
        let tbody = document.getElementById("tbody_filledBuyOrders");
        if (tbody){
            const pairSellUnit = data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1];
            const pairDigitsPrice = window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"];
            $(tbody).prepend('<tr title="Exchange: '+data.p.e+' at '+new Date().toISOString()+'">' +
                '<td>'+data.p.n+" #"+data.p.i+'</td>' +
                '<td>'+convertToLocaleString(data.s, data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[0], false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"])+'</td>' +
                '<td title="Currency: '+pairSellUnit+'">'+convertToLocaleString(data.bP, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"])+'</td>>' +
                '<td title="Currency: '+pairSellUnit+'">'+convertToLocaleString(data.sP, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"])+'</td>' +
                '<td title="Fee: '+convertToLocaleString(data.f, pairSellUnit, true, 0, 8)+'">' + convertToLocaleString((data.s*data.bP), pairSellUnit, false, 0, pairDigitsPrice) + '</td></tr>');
        }
    });

    ws.on('completedOrder', function (data) {
        //console.log(data);
        let tbody = document.getElementById("tbody_completedOrders");
        if (tbody){
            const pairSellUnit = data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[1];
            let plColor = "class='text-danger'";
            if(data.oP > 0){
                plColor = "class='text-success'";
            }
            $(tbody).prepend('<tr title="Exchange: '+data.p.e+' at '+new Date().toISOString()+'">' +
                '<td>'+data.p.n+" #"+data.p.i+'</td>' +
                '<td>'+convertToLocaleString(data.s, data.p.n.split(window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_separator"])[0], false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"])+'</td>' +
                '<td title="Buy fee: '+convertToLocaleString(data.bF, pairSellUnit, true, 0, 8)+'">'+convertToLocaleString(data.bP, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"])+'</td>' +
                '<td title="Sell fee: '+convertToLocaleString(data.sF, pairSellUnit, true, 0, 8)+'">'+convertToLocaleString(data.sP, null, false, 0, window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"])+'</td>' +
                '<td title="Total fees: '+convertToLocaleString((data.bF+data.sF), pairSellUnit, true, 0, 8)+'" '+plColor+'>' + convertToLocaleString(data.oP, pairSellUnit, true, 0, (window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsPrice"] + window[data.p.e + "_" + data.p.n + "_" + data.p.i+"_digitsSize"])) + '</td></tr>');
        }
    });

    function convertToLocaleString(value, currency, btcToSats,  min, max){
        if(value === undefined ){
            value = 0;
        }
        let append = "";
        if(currency != null){
            currency.toUpperCase();
            if(currency.includes("BTC") && btcToSats){
               //convert BTC to sats
               value =  value * 100000000;
               currency = "sats";
               max = 0;
            }
            append = ' '+currency;
        }
        return value.toLocaleString(undefined, {
            minimumFractionDigits: min,
            maximumFractionDigits: max
        })+append;
    }

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

    function getPercentageValue(dividend, divisor, rounded, digits){
        let value = ((dividend / divisor) * 100)*Math.pow(10,digits);
        switch(rounded){
            case "floor":
                value = Math.floor(value);
                break;
            case "round":
                value = Math.round(value);
                break;
            case "ceil":
                value = Math.ceil(value);
                break;
        }
        return value/Math.pow(10, digits);
    }
});