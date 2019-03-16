const os = require('os');
const pty = require('node-pty');

const Plugin = require('./lib/plugin');
const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

const plugin = new Plugin();

const STORE = {};
const PING = {};


function check() {
  const keys = Object.keys(STORE);
  keys.forEach(id => {
    if (PING[id] !== undefined) {
      const interval = Date.now() - PING[id];
      if (interval > 1000 * 60) {
        if (STORE[id] !== undefined) {
          STORE[id].destroy();
          delete STORE[id];
        }
      }
    } else {
      if (STORE[id] !== undefined) {
        STORE[id].destroy();
        delete STORE[id];
      }
    }
  });
}

function ping() {
  const keys = Object.keys(STORE);
  keys.forEach(id => {
    plugin.transferdata(id, { method: 'ping' });
  });
}

function echo(id) {
  PING[id] = Date.now();
}

function createSession(params) {
  return pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: params.cols,
    rows: params.rows,
    cwd: process.env.HOME,
    env: process.env
  });
}

plugin.on('transferdata', ({ id, data }) => {
  switch (data.method) {
    case 'session_data':
      if (STORE[id] !== undefined) {
        STORE[id].write(data.params);
      }
      break;
    case 'session_new':
      STORE[id] = createSession(data.params);
      PING[id] = Date.now();
      plugin.transferdata(id, { method: 'session_ok' })
      STORE[id].on('data', function(data) {
        plugin.transferdata(id, { method: 'session_data', params: data });
      });
      STORE[id].on('close', function(data) {
        plugin.transferdata(id, { method: 'session_close', params: data });
      });
      STORE[id].on('error', function(data) {
        plugin.transferdata(id, { method: 'session_error', params: data });
      });
      break;
    case 'session_close':
      if (STORE[id] !== undefined) {
        STORE[id].destroy();
        delete STORE[id];
      }
      break;
    case 'pong':
      echo(id);
      break;
    default:
      break;
  }
});

plugin.on('start', () => {
  setInterval(check, 1000 * 15);
  setInterval(ping, 1000 * 25);
});
