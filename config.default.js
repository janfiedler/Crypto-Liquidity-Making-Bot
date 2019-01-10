let config = {
    development: {
        debug: true,
        ignoreOrderSize: 10, // How big size of order is ignored
        sleepPause: 10000, // How much ms wait before continue new loop
        coinfalcon: {
            url: "https://coinfalcon.com",
            CF_API_KEY: "",
            CD_API_SECRET_KEY: ""
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
        sleepPause: 10000, // How much ms wait before continue new loop
        coinfalcon: {
            url: "https://coinfalcon.com",
            CF_API_KEY: "",
            CD_API_SECRET_KEY: ""
        },
        coinmate: {
            privateKey: "",
            publicKey: "",
            clientId: ""
        }
    }
};
module.exports = config;
