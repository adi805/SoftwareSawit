#!/usr/bin/env node
/**
 * Sawit-electron MCP Server
 *
 * Model Context Protocol (MCP) server for SoftwareSawit Electron GUI automation.
 * Uses Chrome DevTools Protocol (CDP) to control the Electron app.
 *
 * Usage:
 *   node sawit-electron-mcp.js
 *
 * Environment Variables:
 *   SAWIT_CDP_PORT - CDP port (default: 9222)
 *   SAWIT_CDP_HOST - CDP host (default: 127.0.0.1)
 *   SAWIT_DATA_DIR - App data directory
 */

'use strict';

const http = require('http');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.SAWIT_MCP_PORT || '3470', 10);
const CDP_PORT = parseInt(process.env.SAWIT_CDP_PORT || '9222', 10);
const CDP_HOST = process.env.SAWIT_CDP_HOST || '127.0.0.1';

// ============================================================================
// CDP Client
// ============================================================================

let ws = null;
let cdpConnected = false;

async function connectCDP() {
  return new Promise((resolve, reject) => {
    try {
      const WebSocket = require('ws');
      const wsUrl = `ws://${CDP_HOST}:${CDP_PORT}`;

      ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        cdpConnected = true;
        console.error(`[SawitMCP] Connected to CDP at ${wsUrl}`);
        resolve();
      });

      ws.on('close', () => {
        cdpConnected = false;
        console.error('[SawitMCP] CDP disconnected');
      });

      ws.on('error', (err) => {
        console.error('[SawitMCP] WebSocket error:', err.message);
        if (!cdpConnected) reject(err);
      });

      ws.on('message', (data) => {
        // Handle CDP responses/notifications if needed
      });

      // Timeout
      setTimeout(() => {
        if (!cdpConnected) reject(new Error('CDP connection timeout'));
      }, 5000);
    } catch (err) {
      reject(err);
    }
  });
}

async function cdpCommand(method, params = {}) {
  if (!cdpConnected || !ws) {
    throw new Error('CDP not connected');
  }

  return new Promise((resolve, reject) => {
    const id = Date.now();
    const request = { id, method, params };

    const timeout = setTimeout(() => {
      reject(new Error(`CDP command timeout: ${method}`));
    }, 15000);

    const handler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      } catch (e) {}
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(request));
  });
}

// ============================================================================
// MCP Tools
// ============================================================================

const tools = {
  'navigate': {
    description: 'Navigate to a URL or page in the Electron app',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' }
      },
      required: ['url']
    },
    handler: async ({ url }) => {
      try {
        const result = await cdpCommand('Page.navigate', { url });
        return { success: true, result };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'click': {
    description: 'Click an element by selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' },
        index: { type: 'number', description: 'Index if multiple matches (default: 0)' }
      },
      required: ['selector']
    },
    handler: async ({ selector, index = 0 }) => {
      try {
        const result = await cdpCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const els = document.querySelectorAll('${selector}');
              if (els[${index}]) {
                els[${index}].click();
                return 'clicked';
              }
              return 'not found';
            })()
          `
        });
        return { success: true, result: result.result.value };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'fill': {
    description: 'Fill an input field',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for input' },
        value: { type: 'string', description: 'Value to fill' },
        blur: { type: 'boolean', description: 'Blur after fill (default: true)' }
      },
      required: ['selector', 'value']
    },
    handler: async ({ selector, value, blur = true }) => {
      try {
        const result = await cdpCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const el = document.querySelector('${selector}');
              if (el) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype, 'value'
                )?.set || Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype, 'value'
                )?.set;
                if (nativeInputValueSetter) {
                  nativeInputValueSetter.call(el, '${value.replace(/'/g, "\\'")}');
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  ${blur ? "el.dispatchEvent(new Event('change', { bubbles: true }));" : ""}
                  return 'filled';
                }
                el.value = '${value.replace(/'/g, "\\'")}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return 'filled';
              }
              return 'not found';
            })()
          `
        });
        return { success: true, result: result.result.value };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'select': {
    description: 'Select an option in a dropdown',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for select' },
        value: { type: 'string', description: 'Value to select' }
      },
      required: ['selector', 'value']
    },
    handler: async ({ selector, value }) => {
      try {
        const result = await cdpCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const select = document.querySelector('${selector}');
              if (select) {
                select.value = '${value}';
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return 'selected';
              }
              return 'not found';
            })()
          `
        });
        return { success: true, result: result.result.value };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'waitForSelector': {
    description: 'Wait for an element to appear',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 10000)' }
      },
      required: ['selector']
    },
    handler: async ({ selector, timeout = 10000 }) => {
      try {
        const result = await cdpCommand('Runtime.evaluate', {
          expression: `
            (function() {
              return new Promise((resolve) => {
                const el = document.querySelector('${selector}');
                if (el) {
                  resolve('found');
                  return;
                }
                const observer = new MutationObserver(() => {
                  const el = document.querySelector('${selector}');
                  if (el) {
                    observer.disconnect();
                    resolve('found');
                  }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => {
                  observer.disconnect();
                  resolve('timeout');
                }, ${timeout});
              });
            })()
          `,
          awaitForDebuggerPaused: false
        });
        return { success: true, result: result.result.value };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'getText': {
    description: 'Get text content of an element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' }
      },
      required: ['selector']
    },
    handler: async ({ selector }) => {
      try {
        const result = await cdpCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const el = document.querySelector('${selector}');
              return el ? el.textContent.trim() : 'not found';
            })()
          `
        });
        return { success: true, text: result.result.value };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'getValue': {
    description: 'Get value of an input field',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for input' }
      },
      required: ['selector']
    },
    handler: async ({ selector }) => {
      try {
        const result = await cdpCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const el = document.querySelector('${selector}');
              return el ? el.value : 'not found';
            })()
          `
        });
        return { success: true, value: result.result.value };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'screenshot': {
    description: 'Take a screenshot of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to save screenshot' }
      },
      required: ['path']
    },
    handler: async ({ path: filePath }) => {
      try {
        const result = await cdpCommand('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true
        });
        const fs = require('fs');
        fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
        return { success: true, path: filePath };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'evaluate': {
    description: 'Execute JavaScript in the page context',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'JavaScript expression to execute' }
      },
      required: ['expression']
    },
    handler: async ({ expression }) => {
      try {
        const result = await cdpCommand('Runtime.evaluate', { expression });
        return { success: true, result: result.result.value };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'press': {
    description: 'Press a keyboard key',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press (e.g., Enter, Escape)' }
      },
      required: ['key']
    },
    handler: async ({ key }) => {
      try {
        const keyCode = getKeyCode(key);
        await cdpCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: key,
          code: keyCode
        });
        await cdpCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: key,
          code: keyCode
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  'reload': {
    description: 'Reload the current page',
    inputSchema: {
      type: 'object',
      properties: {},
      handler: async () => {
        try {
          await cdpCommand('Page.reload');
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
    }
  },

  'getPageInfo': {
    description: 'Get current page information',
    inputSchema: {
      type: 'object',
      properties: {},
      handler: async () => {
        try {
          const result = await cdpCommand('Page.getLayoutMetrics');
          return {
            success: true,
            width: result.cssViewport.width,
            height: result.cssViewport.height
          };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
    }
  },

  'isConnected': {
    description: 'Check if MCP server is connected to CDP',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      return {
        success: true,
        connected: cdpConnected,
        cdpHost: CDP_HOST,
        cdpPort: CDP_PORT
      };
    }
  }
};

function getKeyCode(key) {
  const keyMap = {
    'Enter': 'Enter',
    'Escape': 'Escape',
    'Tab': 'Tab',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'ArrowUp': 'ArrowUp',
    'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft',
    'ArrowRight': 'ArrowRight',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown'
  };
  return keyMap[key] || key;
}

// ============================================================================
// MCP JSON-RPC 2.0 Server
// ============================================================================

async function handleJSONRPC(request) {
  const { id, method, params } = request;

  // MCP protocol methods
  if (method === 'initialize') {
    return {
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'sawit-electron', version: '1.0.0' }
      }
    };
  }

  if (method === 'tools/list') {
    return {
      id,
      result: {
        tools: Object.entries(tools).map(([name, tool]) => ({
          name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    const tool = tools[name];

    if (!tool) {
      return {
        id,
        error: { code: -32601, message: `Tool not found: ${name}` }
      };
    }

    try {
      const result = await tool.handler(args || {});
      return {
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        }
      };
    } catch (err) {
      return {
        id,
        error: { code: -32603, message: err.message }
      };
    }
  }

  if (method === 'ping') {
    return { id, result: { pong: true } };
  }

  return {
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  };
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const request = JSON.parse(body);
      const response = await handleJSONRPC(request);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: -32700, message: 'Parse error' } }));
    }
  });
});

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.error('[SawitMCP] Starting Sawit-electron MCP Server...');
  console.error(`[SawitMCP] CDP: ${CDP_HOST}:${CDP_PORT}`);
  console.error(`[SawitMCP] HTTP: 127.0.0.1:${PORT}`);

  try {
    await connectCDP();
    console.error('[SawitMCP] Connected to Electron app via CDP');
  } catch (err) {
    console.error('[SawitMCP] Warning: Could not connect to CDP:', err.message);
    console.error('[SawitMCP] Server will start but tools require CDP connection');
    console.error('[SawitMCP] Make sure Electron is running with --remote-debugging-port=9222');
  }

  server.listen(PORT, '127.0.0.1', () => {
    console.error(`[SawitMCP] Server listening on http://127.0.0.1:${PORT}`);
    console.error('[SawitMCP] Ready for MCP requests');
  });

  process.on('SIGINT', () => {
    console.error('[SawitMCP] Shutting down...');
    if (ws) ws.close();
    server.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[SawitMCP] Fatal error:', err);
  process.exit(1);
});
