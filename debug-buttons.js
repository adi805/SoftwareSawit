const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/C5FDE5C07DB33E400C75A459A057AC0A');

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).substr(2, 9);
    ws.send(JSON.stringify({ id, method, params }));
    const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
    ws.on('message', function handler(data) {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve(msg.result);
      }
    });
  });
}

async function main() {
  // Wait for WebSocket to connect
  await new Promise(r => setTimeout(r, 1000));
  await send('Page.enable');
  await send('Runtime.enable');
  
  console.log('=== Checking COA Form Page ===\n');
  
  // Navigate to COA
  await send('Runtime.evaluate', {
    expression: `(function() {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Buka Master Data COA'));
      if (btn) btn.click();
      return btn ? 'Clicked COA button' : 'Button not found';
    })`
  });
  await new Promise(r => setTimeout(r, 2000));
  
  // Check what page we're on
  let state = await send('Runtime.evaluate', {
    expression: `document.getElementById('root')?.innerText?.substring(0, 300)`
  });
  console.log('After COA click:', state.result?.value);
  
  // Check all buttons
  let buttons = await send('Runtime.evaluate', {
    expression: `(function() {
      return Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim(),
        disabled: b.disabled,
        pointerEvents: window.getComputedStyle(b).pointerEvents,
        visibility: window.getComputedStyle(b).visibility,
        display: window.getComputedStyle(b).display,
        rect: b.getBoundingClientRect()
      }));
    })`
  });
  console.log('\nButtons found:');
  buttons.result?.value?.forEach(b => {
    console.log('  Text:', b.text);
    console.log('    disabled:', b.disabled);
    console.log('    pointerEvents:', b.pointerEvents);
    console.log('    visibility:', b.visibility);
    console.log('    display:', b.display);
    console.log('    rect:', JSON.stringify(b.rect));
  });
  
  // Try clicking Batal specifically
  console.log('\n=== Testing Batal Click ===');
  let batalResult = await send('Runtime.evaluate', {
    expression: `(function() {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Batal'));
      if (!btn) return 'Batal not found';
      console.log('Found Batal button at:', JSON.stringify(btn.getBoundingClientRect()));
      btn.click();
      return 'Clicked Batal';
    })`
  });
  console.log('Batal click result:', batalResult.result?.value);
  await new Promise(r => setTimeout(r, 2000));
  
  // Check state after Batal
  state = await send('Runtime.evaluate', {
    expression: `document.getElementById('root')?.innerText?.substring(0, 300)`
  });
  console.log('After Batal:', state.result?.value);
  
  ws.close();
  process.exit(0);
}

ws.on('error', err => {
  console.error('Error:', err.message);
  process.exit(1);
});

main().catch(e => {
  console.error('Main error:', e.message);
  process.exit(1);
});
