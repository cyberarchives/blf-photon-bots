const WebSocket = require('ws');
const crypto = require('crypto');

async function connectSocket(host, port, protocol) {
    console.log("Connecting to", `ws://${host}:${port}`);
  const key = crypto.randomBytes(16).toString('base64');
  const ws = new WebSocket(`ws://${host}:${port}`, [protocol], {
    headers: {
      'Host': `${host}:${port}`,
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': key,
      'Origin': `ws://${host}:${port}`,
      'Sec-WebSocket-Protocol': protocol,
    },
  });

  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

module.exports = { connectSocket };