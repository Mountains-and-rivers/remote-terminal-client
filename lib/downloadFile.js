const fs = require('fs');
const os = require('os');
const p = require('path');
const Base64 = require('js-base64').Base64;
var MOJA_HOME = "";
;if(process.argv[3] == 'err'){
  console.log(Base64.decode(process.argv[2]))
}else {
  var baseFileName = process.argv[2];
  var fileName = Base64.decode(baseFileName);
  MOJA_HOME = p.join(os.homedir(),'.moja');
  fs.rename(`${MOJA_HOME}/tmpFile/${baseFileName}`, `./${fileName}`, function (err) {
    if(err) {
      console.error(err);
    }
  });
}
