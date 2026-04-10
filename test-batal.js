const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/C5FDE5C07DB33E400C75A459A057AC0A');

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
    }, 10000);
  });
}

ws.on('open', async () => {
  console.log('Connected to CDP\n');
  
  await send('Page.enable');
  await send('Runtime.enable');
  
  // Navigate to COA
  console.log('=== Step 1: Navigate to COA ===');
  await send('Runtime.evaluate', {
    expression: `(function() {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Buka Master Data COA'));
      if (btn) btn.click();
      return btn ? 'Clicked COA' : 'Not found';
    })`
  });
  await new Promise(r => setTimeout(r, 2000));
  
  let state = await send('Runtime.evaluate', {
    expression: `document.getElementById('root')?.innerText?.substring(0, 200)`
  });
  console.log('State:', state.result?.value);
  
  // Click "Tambah COA Baru"
  console.log('\n=== Step 2: Click "Tambah COA Baru" ===');
  await send('Runtime.evaluate', {
    expression: `(function() {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tambah COA'));
      if (btn) btn.click();
      return btn ? 'Clicked Tambah COA' : 'Not found';
    })`
  });
  await new Promise(r => setTimeout(r, 2000));
  
  state = await send('Runtime.evaluate', {
    expression: `document.getElementById('root')?.innerText?.substring(0, 300)`
  });
  console.log('State after Tambah:', state.result?.value);
  
  // Check if Batal exists
  console.log('\n=== Step 3: Check Batal Button ===');
  const buttons = await send('Runtime.evaluate', {
    expression: `(function() {
      const btns = Array.from(document.querySelectorAll('button'));
      const batal = btns.find(b => b.textContent?.includes('Batal'));
      if (batal) {
        const rect = batal.getBoundingClientRect();
        const style = window.getComputedStyle(batal);
        return {
          found: true,
          text: batal.textContent,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          visible: style.visibility,
          display: style.display,
          pointerEvents: style.pointerEvents
        };
      }
      return { found: false, allButtons: btns.map(b => b.textContent?.trim()) };
    })`
  });
  console.log('Batal button:', JSON.stringify(buttons.result?.value, null, 2));
  
  // Try to click Batal using dispatchEvent for React
  console.log('\n=== Step 4: Click Batal with React Event ===');
  const clickResult = await send('Runtime.evaluate', {
    expression: `(function() {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Batal'));
      if (!btn) return 'Batal not found';
      
      // Try React's synthetic event approach
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Simulate mouse events that React listens to
      const mouseDownEvent = new MouseEvent('mousedown', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY
      });
      
      const mouseUpEvent = new MouseEvent('mouseup', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY
      });
      
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY
      });
      
      btn.dispatchEvent(mouseDownEvent);
      btn.dispatchEvent(mouseUpEvent);
      btn.dispatchEvent(clickEvent);
      
      return 'Dispatched mouse events at: ' + centerX + ',' + centerY;
    })`
  });
  console.log('Click result:', clickResult.result?.value);
  
  await new Promise(r => setTimeout(r, 2000));
  
  state = await send('Runtime.evaluate', {
    expression: `document.getElementById('root')?.innerText?.substring(0, 300)`
  });
  console.log('\nState after Batal:', state.result?.value);
  
  ws.close();
  process.exit(0);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id && pending[msg.id]) {
    pending[msg.id](msg.result);
  }
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
