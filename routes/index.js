var express = require('express');
var router = express.Router();
let config = require('../config');

/* GET home page. */
router.get('/', async function(req, res, next) {
  let exchangeList = [];
  for(let i=0;i<config.exchanges.length;i++){
    if(config.exchanges[i].active) {
      let ex = {"name": config.exchanges[i].name, "pairs": []};
      for(let ii=0;ii<config.exchanges[i].pairs.length;ii++){
        if(config.exchanges[i].pairs[ii].active){
          ex.pairs.push({"name": config.exchanges[i].pairs[ii].name, "id": config.exchanges[i].pairs[ii].id, "separator": config.exchanges[i].pairs[ii].separator});
        }
      }
      exchangeList.push(ex);
    }
  }
  res.render('index', { title: 'Crypto Liquidity Making Bot', "exchanges": exchangeList});
});

module.exports = router;