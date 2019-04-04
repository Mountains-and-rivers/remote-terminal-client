const p         = require('path');
const os        = require('os');
const version = require('../version/moja-version.js').version;
var MOJA_HOME = p.join(os.homedir(),'.moja');

module.exports = {
    TERMINAL_ID_PATH         : p.resolve(MOJA_HOME, 'terminalId.js'),
    PUBLIC_KEY_PATH          : p.resolve(MOJA_HOME, 'publicKey.js'),
    EMAIL_PATH               : p.resolve(MOJA_HOME, 'email.js'),
    USER_ID_PATH             : p.resolve(MOJA_HOME, 'userId.js'),
    MOJA_VERSION_PATH        : p.resolve(MOJA_HOME, 'moja-version'),
    MOJA_STAGE_PATH          : p.resolve(MOJA_HOME, 'stage'),
    MOJA_UNISTALL_PATH       : p.resolve(MOJA_HOME, 'uninstall.log'),
    MOJA_UPDATE_PATH         : p.resolve(MOJA_HOME, 'update.log'),
    DOWNLOAD_PATH            : p.resolve(MOJA_HOME, 'tmpFile'),
    MOJA_DOWNLOAD_PATH       : p.resolve(MOJA_HOME, `client/v${version}/remote-terminal-client/lib/downloadFile.js`),
};
