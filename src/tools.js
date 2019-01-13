exports.getAccountsBalance = function(){
    return new Promise(function (resolve) {
        let request_path = "/api/v1/user/accounts";
        let url = config.coinfalcon.url + request_path;
        request.get({url: url, headers : sign("GET", request_path)}, async function (error, response, body) {
            if (!error && response.statusCode === 200) {
                resolve(JSON.parse(body));
            } else {
                //throw 'Error';
                console.error(error);
                //console.log('Error getProxyTotalHashes');
            }
        });
    });
};