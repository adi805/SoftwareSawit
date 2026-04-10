const WebSocket = require('ws');

const wsUrl = 'ws://127.0.0.1:9222/devtools/page/1CC5653D5881CB21B904848C979EDFC4';
const ws = new WebSocket(wsUrl);

let id = 1;
const pending = {};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = id++;
    pending[msgId] = resolve;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    setTimeout(() => {
      if (pending[msgId]) {
        delete pending[msgId];
        reject(new Error('Timeout'));
      }
    }, 5000);
  });
}

ws.on('open', async () => {
  console.log('Connected to CDP');
  
  try {
    // Enable domains
    await send('Page.enable');
    await send('Runtime.enable');
    console.log('Domains enabled');
    
    // Reload to get clean dashboard
    console.log('\n=== Reloading ===');
    await send('Page.reload');
    await new Promise(r => setTimeout(r, 3000));
    
    // Get Dashboard
    console.log('\n=== Dashboard Status ===');
    const dashboard = await send('Runtime.evaluate', { expression: `
      (function() {
        const root = document.getElementById('root');
        return root ? root.innerText.substring(0, 800) : 'No root';
      })()
    ` });
    console.log('Dashboard:', dashboard.result?.value);
    
    // Test COA Master Data
    console.log('\n=== Testing COA Master Data ===');
    const clickCOA = await send('Runtime.evaluate', { expression: `
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent?.includes('Buka Master Data COA'));
        if (btn) { btn.click(); return 'Clicked COA'; }
        return 'Not found';
      })()
    ` });
    console.log('Click:', clickCOA.result?.value);
    await new Promise(r => setTimeout(r, 2000));
    
    const coaState = await send('Runtime.evaluate', { expression: `
      (function() {
        const root = document.getElementById('root');
        return root ? root.innerText.substring(0, 600) : 'No root';
      })()
    ` });
    console.log('COA Master Data:', coaState.result?.value);
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  ws.close();
  process.exit(0);
});

ws.on('message', data => {
  const msg = JSON.parse(data);
  if (msg.id && pending[msg.id]) {
    pending[msg.id](msg.result);
  }
});

ws.on('error', err => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});
