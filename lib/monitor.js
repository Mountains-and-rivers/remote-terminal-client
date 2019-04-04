const exec = require('child_process').exec;
const zlib = require('zlib');
const request = require('request');
const os = require('os');
const path = require('path');
const nanoSecond = require('nano-time');
const logicalCpuCount = require('os').cpus().length;
const config = require('../config/config.js');
const osType=os.platform();

function monitor() {

}

//获取top命令的PID COMMAND CPU MEM uptime
monitor.prototype.taskList = function (callback) {
  if(osType == 'linux'){
    var cmd   = "top -bn1|awk 'NR>7{print $1,$12,$11,$10,$9}'";
    exec(cmd, function (error, stdout, stderr) {
      var topArray = stdout.split('\n');
      topArray.pop();
      var timeStamp = nanoSecond();
      callback(error, topArray.map(function (item) {
        item.replace('/\s+/g', ' ').trim();
        var tmpArray = item.split(" "),itemMap = [];
        itemMap.push(tmpArray[0]);
        itemMap.push(tmpArray[1]);
        itemMap.push(tmpArray[2]);
        itemMap.push(tmpArray[3]);
        itemMap.push(tmpArray[4]);
        itemMap.push(timeStamp);
        return itemMap;
      }))
    });
  }
  if(osType == 'darwin'){
    var cmdUsage   = "top -l 1|awk 'NR>12{print $1,$2,$4,$8,$3}'";
    var cmdMemTotal ="top -l 1|awk '/PhysMem/{print $2}'|awk -F 'M' '{print $1}'";
    exec(cmdMemTotal, function (error, stdout, stderr) {
      var memTotal = stdout.split('\n');
      memTotal.pop();
      exec(cmdUsage, function (error, stdout, stderr) {
        var topArray = stdout.split('\n');
        topArray.pop();
        var timeStamp = nanoSecond();
        callback(error, topArray.map(function (item) {
          item.replace('/\s+/g', ' ').trim();
          var tmpArray = item.split(" "),itemMap = [],
            memus=tmpArray[3].replace(/[\+-]$/, '');
          var usageUnit = {
            k: 1024,
            m: 1024*1024,
            g: 1024*1024*1024,
            t: 1024*1024*1024*1024
          };
          [all, memUsage, unit] = memus.match(/([\d\.]*)(\w)$/);
          memUsage *= usageUnit[unit.toLowerCase()] || 1;
          itemMap.push(tmpArray[0]);
          itemMap.push(tmpArray[1]);
          itemMap.push(tmpArray[2]);
          itemMap.push((parseFloat(memUsage*100/(memTotal[0]*1024*1024)).toFixed(2)));
          itemMap.push(tmpArray[4].replace(/[\+-]$/, ''));
          itemMap.push(timeStamp);
          return itemMap;
        }))
      });
    });
   }
};

//获取cpu men df 使用率
monitor.prototype.totalUsage = function (callback) {
  if (osType == 'darwin')
  {
   var home='Users';
  }else{
  var home='home';
  }
  var cmd = `sh ${path.resolve(path.join(__dirname, "../usage/usage.sh"))}`;
  exec(cmd, function (error, stdout, stderr) {
    if(error){
      console.log('[' + (new Date()) + ' Get TotalusAge]  Get TotalusAge with error: ' + error," ,stderr: " + stderr);
      callback(error,{code:1});
    }else {
      var tmpArr = stdout.split('\n');
      tmpArr.pop();
      var tmpUsage = JSON.parse(tmpArr[0]);
      if (osType=='linux'){
      var usage = (100 - parseFloat(tmpUsage.cpuUsage)).toFixed(1);
      }
      if(osType=='darwin') {
       var usage = tmpUsage.cpuUsage; 
      }
      callback(null,{code:0,cpuUsage:usage,memUsage:tmpUsage.memUsage*100,diskUsage:tmpUsage.diskUsage,time:tmpUsage.time});
    }
  });
};

//获取cpu核数
monitor.prototype.cpuCode = function () {
  return {logicCpu:logicalCpuCount,time:nanoSecond()};
};

monitor.prototype.sendData = function (data,callback) {
  zlib.gzip(JSON.stringify(data), function (err, buffer) {
    var options = {
      uri: config.httProtocol+config.HOST+config.postMonitor,
      method: 'POST',
      headers: {
        'content-encoding': 'gzip',
        'content-type': 'application/json'
      },
      body: buffer
    };
    request(options, function (error, response, body) {
			callback();
      if (!error && response.statusCode == 200) {
        console.log('[' + (new Date()) + ' send monitorData] send monitorData with successed!');
      }else {
        console.log('[' + (new Date()) + ' send monitorData] send monitorData with error: ' + error|| response.statusCode);
      }
    });
  });
}

module.exports = new monitor;

