let config = {
    development: {
        debug: true,

        coinfalcon: {
            url: "https://coinfalcon.com",
            CF_API_KEY: "",
            CD_API_SECRET_KEY: "",
            ignoreOrderSize: 10, // How big size of order is ignored
            pipsSpread: 0.0010, // How big spread between ask/bid order and between first and second order
            sleepPause: 10000, // How much ms wait before continue new loop
        },
        coinmate: {
            privateKey: "",
            publicKey: "",
            clientId: ""
        }
    },
    production: {
        debug: true,
        ignoreOrderSize: 10,
        pipsSpread: 0.0010, // How big spread between ask/bid order and between first and second order
        sleepPause: 10000, // How much ms wait before continue new loop
        coinfalcon: {
            url: "https://coinfalcon.com",
            CF_API_KEY: "",
            CD_API_SECRET_KEY: "",
            ignoreOrderSize: 10, // How big size of order is ignored
            pipsSpread: 0.0010, // How big spread between ask/bid order and between first and second order
            sleepPause: 10000, // How much ms wait before continue new loop
        },
        coinmate: {
            privateKey: "",
            publicKey: "",
            clientId: ""
        }
    }
};
module.exports = config;
