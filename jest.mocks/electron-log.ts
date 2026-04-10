// Jest mock for electron-log
// Provides no-op implementations for logging during tests

const electronLogMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  silly: jest.fn(),
  log: jest.fn(),
  
  // Transport/scope methods
  scope: jest.fn(() => electronLogMock),
  unscope: jest.fn(),
  
  // Config methods
  getConfig: jest.fn(() => ({})),
  updateConfig: jest.fn(),
  
  // Transport level
  transports: {
    console: {
      format: '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}',
      level: 'info',
      colorize: true,
    },
    file: {
      format: '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}',
      level: false,
      fileName: 'electron-test.log',
      maxSize: 10 * 1024 * 1024, // 10MB
    },
    ipc: {
      level: false,
    },
    remote: {
      level: false,
    },
  },
  
  // Initialize/cleanup
  initialize: jest.fn(),
  close: jest.fn(),
  
  // Error tracking
  catchErrors: jest.fn(),
  onError: jest.fn(),
};

module.exports = electronLogMock;
module.exports.default = electronLogMock;
