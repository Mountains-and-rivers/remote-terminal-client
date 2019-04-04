const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require('crypto');
const child_process = require("child_process");
var ss = require('socket.io-stream');
const Base64 = require('js-base64').Base64;
const paths = require('./lib/paths.js');
const msmonit = require('./lib/monitor');
const ctx = require('./lib/constants.js');
const config = require('./config/config.js');
const io = require('socket.io-client');
const pty = require('moja-pty').moja_pty;
const version = require('./version/moja-version.js').version;
const getExecShellLog = require('./lib/getExecShellLog.js');
const terminalId = require(paths.TERMINAL_ID_PATH);
const userId = require(paths.USER_ID_PATH);
const publicKey = require(paths.PUBLIC_KEY_PATH).publicKey;
const email = require(paths.EMAIL_PATH).email;
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

var Eth0MacAddress = "",
    Eth0IPAddress = "",
    Wlan0MacAddress = "",
    Wlan0IPAddress = "",
    TotalDf = 0,
    UsedDf = 0,
    AvailDf = 0,
    ProductModel = "",
    TerminalId="",
    UserId="",
    SetInterValCount = 0,
    Terminal = {},
    Logs = {},
    CloseCommMsg = {},
    TopListData = [],
    TotalUsage = [],
    UpdateStatus ={};

try {
  //判断根据版本号判断当前启动是否为升级启动 若为升级起动则删除旧版本进程
  var oldVersion = fs.readFileSync(paths.MOJA_VERSION_PATH).toString().replace(/(\r|\n)/gi, "");
  if(oldVersion != version) {
    child_process.execSync(`sh ${path.resolve(path.join(__dirname, "./operation/killApp.sh"))} ${version}`);
  }
  //获取磁盘信息
  UsedDf = child_process.execSync('echo `df -k  |grep -w "/"|awk -F \' \'  \'{print $3}\'`').toString().trim();
  AvailDf = child_process.execSync('echo `df -k  |grep -w "/"|awk -F \' \'  \'{print $4}\'`').toString().trim();
  TotalDf = parseInt(UsedDf) + parseInt(AvailDf);
  ProductModel = os.hostname();

  //获取网卡信息
  netInterInfo = os.networkInterfaces();
  if(os.platform() == 'linux') {
    netInterInfo.eth0 && (Eth0MacAddress = netInterInfo.eth0[0].mac);
    netInterInfo.eth0 && (Eth0IPAddress = netInterInfo.eth0[0].address);
    netInterInfo.wlan0 && (Wlan0MacAddress = netInterInfo.wlan0[0].mac);
    netInterInfo.wlan0 && (Wlan0IPAddress = netInterInfo.wlan0[0].address);
  }
  if(os.platform() == 'darwin'){
    netInterInfo.en0 && (Wlan0MacAddress = netInterInfo.en0[1].mac);
    netInterInfo.en0 && (Wlan0IPAddress = netInterInfo.en0[1].address);
  }
} catch (error) {
  console.error('[' + (new Date()) + '] Init variable with ERROR: ' + error);
}
var HOME="";

if (os.platform() == 'darwin'){
  HOME='Users'
}

if (os.platform() == 'linux'){
  HOME='home'
}

var macAddr = JSON.stringify({
  eth0: Eth0MacAddress,
  wlan0: Wlan0MacAddress
});
var ip = JSON.stringify({
  eth0IPAddress: Eth0IPAddress,
  wlan0IPAddress: Wlan0IPAddress,
});

TerminalId = terminalId;
UserId = userId;

var controlQuery = `&totalDf=${TotalDf}&usedDf=${UsedDf}&productModel=${ProductModel}&macAddr=${macAddr}&ip=${ip}`;
var timestamp = Date.now();
var authorize = {
  "reconnect":false,
  "email": email,
  "timestamp": timestamp,
  "terminalId":terminalId,
  "ticket": crypto.publicEncrypt(Base64.decode(publicKey), Buffer.from(`${email}-${timestamp}`))
};

var controlRequestUrl =`${config.httProtocol}${config.HOST}?type=${config.CONTROLPATH}${controlQuery}`;
var commandRequestUrl = `${config.httProtocol}${config.HOST }?type=${config.COMMNDPATH}`;

if (publicKey.length !== 0) {
  controlRequestUrl += `&key=public&version=${version}`;
  commandRequestUrl += `&key=public`;
}

const socket = io(controlRequestUrl,{
  secure:true,
  reconnection:true,
  rejectUnauthorized: false,
  reconnectionDelayMax:10000,
  reconnectionDelay:800,
  randomizationFactor:0.1,
  transports:['websocket', 'polling'],
  extraHeaders: {
    authorize:JSON.stringify(authorize)
  }
});
  /*
  authorize ：
  * reconnect 是否重连
  * email 用户邮箱
  * timestamp 时间戳
  * terminalId 设备Id
  * ticket 公钥 邮箱 时间戳加密票据
  * */
 socket.on('reconnect_attempt',()=> {
   authorize['terminalId'] = TerminalId;
   socket.io.opts.extraHeaders = {
     authorize:JSON.stringify(authorize),
   }
 });
socket.on('error', (error) => {
  console.error('[' + (new Date()) + ' Control] Connect error  ' + controlRequestUrl + " With " + JSON.stringify(arguments[0]));
});
socket.on('connect_error', (data) => {
  console.error('[' + (new Date()) + ' Control] Connect connect_error  ' + controlRequestUrl + " With " + JSON.stringify(arguments[0]));
});
socket.on('message', (MSG) => {
  console.log('[' + (new Date()) + ' Control] Client receive message ' + JSON.stringify(MSG));
  try {
    var message = JSON.parse(MSG);
  } catch (error) {
    console.error('[' + (new Date()) + ' Control] Client receive message with error: ' + error);
    return;
  }
  if (message.Type == ctx.OPERATION_TYPE.CLOSECONNECT) {
    if (message.opType == ctx.MESSAGE_TYPE.COMMON_TYPE) {
      var tmPid = message.data.pid;
      CloseCommMsg[tmPid]=message;
      socket.send(JSON.stringify({Type:ctx.OPERATION_TYPE.CLOSECONNECT, opType:ctx.MESSAGE_TYPE.COMMON_TYPE, userId:message.data.userId, pid:tmPid}));
    }
  }else if (message.Type == ctx.OPERATION_TYPE.EXECSCRIPT){
    if (message.opType == ctx.MESSAGE_TYPE.COMMON_TYPE) {
      var termId = message.terminalId, time = message.time, shellId = message.shellId, userIdm = message.userId;
      var topic = userIdm + termId + time;
      getExecShellLog.getShellExecLog(termId,shellId,userIdm,function (err, result) {
        socket.emit(topic,JSON.stringify({Type: ctx.OPERATION_TYPE.EXECSCRIPT, result:result}))
      })
    }
  }else if (message.Type == ctx.OPERATION_TYPE.TERMINAL) {
    var terminObj = message.data;
    if (message.opType == ctx.MESSAGE_TYPE.COMMON_TYPE) {
      var cols = terminObj.cols, rows = terminObj.rows, pid = terminObj.pid;
      socket.send(JSON.stringify({type: ctx.OPERATION_TYPE.TERMINAL, opType: ctx.MESSAGE_TYPE.COMMON_TYPE, userId: UserId}));
      if (!Terminal[pid]) {
//---------------------------------------次处单独封装后现象为：主动触发disconnect没反应 间隔30s断开(disconnect)重连---------------------------------------------------
        var socketComm = io(`${commandRequestUrl}&pid=${pid}&version=${version}&terminalId=${TerminalId}`,{
          secure: true,
          reconnection:true,
          rejectUnauthorized: false,
          reconnectionDelayMax:10000,
          reconnectionDelay:300,
          randomizationFactor:0.5,
          transports:['websocket', 'polling'],
          extraHeaders: {
            authorize:JSON.stringify(authorize)
          }
        });
          /*
          authorize ：
          * reconnect 是否重连
          * email 用户邮箱
          * timestamp 时间戳
          * terminalId 设备Id
          * ticket 公钥 邮箱 时间戳加密票据
          * */
        socketComm.on('reconnect_attempt',()=> {
          authorize['reconnect'] = true;
            socketComm.io.opts.extraHeaders = {
              authorize:JSON.stringify(authorize),
            }
        });
        socketComm.on('error', (error) => {
          console.error('[' + (new Date()) + ' Command] Connect error  ' + commandRequestUrl + " With " + JSON.stringify(arguments[0])+", pid from server: " + pid);
        });
        socketComm.on('connect_error', (data) => {
          console.error('[' + (new Date()) + ' Command] Connect connect_error  ' + commandRequestUrl + " With " + JSON.stringify(arguments[0])+", pid from server: " + pid);
        });
        socketComm.on('message', (msg) => {
          console.log('[' + (new Date()) + ' Command] Client receive message ' +msg+", pid from server: " + pid);
          try {
            Terminal[pid].write(msg);
          } catch (error) {
            console.error('[' + (new Date()) + ' Command] Terminal write msg with error: ' + error+", pid from server: " + pid);
          }
        });
        socketComm.on('connect', () => {
          authorize['reconnect']=false;
          console.log('[' + (new Date()) + ' Command] Client Connected With URL ' + commandRequestUrl+", pid from server: " + pid);
          socketComm.once(`${TerminalId}:${UserId}:${pid}`,function(){
            if (!Terminal[pid]) {
              Terminal[pid] = pty.spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], {
              name: 'xterm-color',
              cols: cols || 80,
              rows: rows || 24,
              cwd: os.homedir(),
              env: process.env
            });
              Terminal[pid].on('data', (data) => {
              Logs[pid] += data;
              socketComm.send(data);
            });
          }
          console.log('[' + (new Date()) + ' Command] Created terminal with PID: ' + Terminal[pid].pid+", pid from server: " + pid);
          })
        });
        socketComm.on('disconnect', () => {
          console.log('[' + (new Date()) + ' Command] Connection Closed by server pid: ' + pid+", pid from server: " + pid);
          if (CloseCommMsg[pid] && CloseCommMsg[pid].Type == ctx.OPERATION_TYPE.CLOSECONNECT){
            Terminal[pid].kill();
            delete CloseCommMsg[pid];
            delete Terminal[pid];
            delete Logs[pid];
          }
        })
//---------------------------------------------------------------------------------------------
      }
    }
  }else if (message.Type == ctx.OPERATION_TYPE.TERMINALID) {
    var terminObj = message.data;
    TerminalId = terminObj.terminalId;
    UserId =terminObj.userId;
    fs.writeFileSync(paths.TERMINAL_ID_PATH, `exports = module.exports = "${terminObj.terminalId}";`);
    fs.writeFileSync(paths.USER_ID_PATH, `exports = module.exports = "${terminObj.userId}";`);
  }else if (message.Type == ctx.OPERATION_TYPE.UPLOADFILE){
    var downData=message.data;
    socket.emit(downData.topic,JSON.stringify({Type:"uploadFile",terminalId:TerminalId,userId:UserId}));
    var tmpFile = fs.createWriteStream(`${paths.DOWNLOAD_PATH}/${downData.name}`);
    tmpFile.on('error', function (err) {
      Terminal[downData.pid].write(`node ${paths.MOJA_DOWNLOAD_PATH} ${Base64.encode(err)} 'err'\r`);
        console.error('Download with error: ' + err,'filename: ' + downData.name);
      });
    tmpFile.on('close', function () {
      Terminal[downData.pid].write(`node ${paths.MOJA_DOWNLOAD_PATH} ${downData.name}\r`);
      });
    ss(socket).on(downData.topic, stream => {
      stream.pipe(tmpFile);
    })
  }else if (message.Type == ctx.OPERATION_TYPE.DELETETERMINAL) {
    var cmd = `sh ${path.resolve(path.join(__dirname, "./operation/uninstall.sh"))} ${version} 2 > ${paths.MOJA_UNISTALL_PATH}`;
    var unIsntall = child_process.exec(cmd, { maxBuffer : 1000 * 1024 });
    var uout = "", uerr = "";
    unIsntall.stdout.on("data", (trunk) => {
      uout += trunk;
    });
    unIsntall.stderr.on("data", (trunk) => {
      uerr += trunk;
    });
    unIsntall.on("error", (error) => {
      console.error('[' + (new Date()) + ' error delete operation] exec operation  with error: ' + error+" ,terminalId: "+ terminObj.terminalId +" ,userId: " + UserId);
    });
    unIsntall.on("exit", (code, signal) => {
      console.log('[' + (new Date()) + ' exit delete operation] exit operation with code: ' + code+" ,stdout: " + uout + " ,stderr: " + uerr+" ,terminalId: "+ terminObj.terminalId+" ,userId: " + UserId);
    });
    unIsntall.on("close", (code, signal) => {
      console.log('[' + (new Date()) + ' close delete operation] close operation with code: ' + code+" ,terminalId: "+ terminObj.terminalId+" ,userId: " + UserId);
    });
  }else if (message.Type == ctx.OPERATION_TYPE.UPGRDDE) {
    var terminObj = message.data;
    var cmd = `sh ${path.resolve(path.join(__dirname, "./operation/upgrade.sh"))} ${terminObj.version} 2 > ${paths.MOJA_UPDATE_PATH}`;
    var updateShell = child_process.exec(cmd, { maxBuffer : 10000 * 1024 });
    var uout = "", uerr = "";
    UpdateStatus = {Type:"progress", isUpdateCompelete:true, result:false, logString:"", terminalId:TerminalId, userId:UserId};
    updateShell.stdout.on("data", (trunk) => {
      uout += trunk;
    });
    updateShell.stderr.on("data", (trunk) => {
      uerr += trunk;
    });
    updateShell.on("error", (error) => {
      UpdateStatus.isUpdateCompelete = false;
      UpdateStatus.logString = error;
      console.error('[' + (new Date()) + ' error upgrade operation] exec operation with error: ' + error+" ,terminalId: "+ terminObj.terminalId+" ,userId: " + UserId);
    });
    updateShell.on("exit", (code, signal) => {
      console.log('[' + (new Date()) + ' exit upgrade operation] exit operation with code: ' + code+" ,stdout: " + uout + " ,stderr: " + uerr+" ,terminalId: "+ terminObj.terminalId+" ,userId: " + UserId);
      UpdateStatus.isUpdateCompelete = false;
      if (code ==0 || code == null) {
        UpdateStatus.logString = "upgrade success!";
        UpdateStatus.result = true;
      }else {
        UpdateStatus.logString = fs.readFileSync(paths.MOJA_UPDATE_PATH).toString();
        UpdateStatus.result = false;
      }
      socket.send(JSON.stringify(UpdateStatus));
    });
    updateShell.on("close", (code, signal) => {
      console.log('[' + (new Date()) + ' close upgrade operation] close operation with code: ' + code+" ,terminalId: "+ terminObj.terminalId+" ,userId: " + UserId);
    })
    fs.watch(paths.MOJA_STAGE_PATH, (event, filename) =>{
      var stage = fs.readFileSync(paths.MOJA_STAGE_PATH).toString().replace(/(\r|\n)/gi, "");
      UpdateStatus.progress = stage;
      socket.send(JSON.stringify(UpdateStatus));
    })
  }else {
    console.log('[' + (new Date()) + ' Control] Received Unknown Websocket Message: ' + MSG);
    socket.send(JSON.stringify({message: {errorCode: 1}, userId: UserId}));
  }
});
socket.on('connect', () => {
  global.socket = socket;
  console.log('[' + (new Date()) + ' Control] Client Connected With URL ' + controlRequestUrl);
});
socket.on('disconnect', () => {
  console.error('[' + (new Date()) +  ' Control] Connect disconnect  ' + controlRequestUrl + " With " + JSON.stringify(arguments[0]));
})

function getTopList (){
  if (UserId.length != 0 && TerminalId.length != 0) {
    msmonit.taskList(function (error,topList) {
      TopListData.push(topList);
    });
    msmonit.totalUsage(function(err,usage){
      TotalUsage.push(usage);
    })
  }
}

function sendMonitorData (){
  if (UserId.length != 0 && TerminalId.length !=0) {
    msmonit.sendData(JSON.stringify({userId:UserId, terminalId:TerminalId, topListData:TopListData, totalUsage:TotalUsage, cpuCode:msmonit.cpuCode()}),function(){
      TopListData.length = 0;
      TotalUsage.length = 0;
    });
  }
}

function setInterVal(){
  SetInterValCount++;
  getTopList();
  if (SetInterValCount % 2 == 0) {
    SetInterValCount = 0;
    sendMonitorData();
  }
  setTimeout(setInterVal,1000*30);
}
setInterVal();

