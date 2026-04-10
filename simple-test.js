const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/C5FDE5C07DB33E400C75A459A057AC0A');

ws.on('open', () => {
  console.log('Connected!');
  
  // Simple test - just get page info
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.title' } }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('Received:', JSON.stringify(msg, null, 2));
  
  if (msg.id === 1) {
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout');
  process.exit(1);
}, 10000);
