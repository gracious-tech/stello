
// Provide access to ipcRenderer within renderer since renderer doesn't have access to node otherwise
// See https://github.com/electron/electron/issues/9920
window.ipcRenderer = require('electron').ipcRenderer
