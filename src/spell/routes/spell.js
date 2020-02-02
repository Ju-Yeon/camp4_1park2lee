var express = require('express');
var router = express.Router();
var mysql = require('../modules/mysql.js')

const spellCheck = require('../modules/spell-check.js')

/* GET users listing. */
router.get('/', function (req, res, next) {
  mysql.responseRank(function (reply) {
    if (reply == undefined) {
      var reply = {
        status: -1,
        err: '랭킹정보가 존재하지 않습니다.'
      };
    }
    res.json(reply);

  });
});

router.get('/:id', function (req, res, next) {
  mysql.responseUserRank(req.params.id, 3, function (result) {
    res.json(result);
  })
});

router.post('/', function (req, res, next) {
  let context = req.body['context'];
  let rId = req.body['reqId'];
  let uId = req.body['userId'];
  if (context == undefined || rId == undefined) {
    res.json({
      status: -2,
      err: '인자가 부족합니다.'
    })
    return;
  }

  let errCount = 0; // 에러 카운트
  spellCheck(context, 3000, function (message, err) {
    if (err) {
      res.json({
        status: -1,
        err: err
      });
      return;
    } else {
      for (var i = 0; i < message.length; i++) {
        for (var j = 0; j < message[i].length; j++) {

          token = message[i][j]['token'];
          suggestion = message[i][j]['suggestions'][0];

          if (token == suggestion) continue;
          context = context.replace(token, suggestion);
          errCount++;
          var data = [token, suggestion]
          mysql.getWords(data, uId)

        }
      }
      res.json({
        status: 1,
        correct: context,
        errors: errCount,
        requestId: rId,
      })
    }
  });
})

module.exports = router;