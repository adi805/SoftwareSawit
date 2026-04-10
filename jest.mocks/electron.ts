// Jest mock for Electron main process modules
// This allows tests to run without requiring actual Electron runtime

const electronMock = {
  app: {
    getVersion: jest.fn(() => '1.0.0'),
    getPath: jest.fn((name: string) => `/mock/path/${name}`),
    getName: jest.fn(() => 'SoftwareSawit'),
    getLocale: jest.fn(() => 'en-US'),
    isReady: jest.fn(() => true),
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    webContents: {
      send: jest.fn(),
      on: jest.fn(),
    },
    on: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
    isDestroyed: jest.fn(() => false),
    minimize: jest.fn(),
    maximize: jest.fn(),
    unmaximize: jest.fn(),
    setFullScreen: jest.fn(),
    isFullScreen: jest.fn(() => false),
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeHandler: jest.fn(),
    removeListener: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  Menu: {
    buildFromTemplate: jest.fn(),
    setApplicationMenu: jest.fn(),
  },
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    showMessageBox: jest.fn(),
    showErrorBox: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
    showItemInFolder: jest.fn(),
  },
  process: {
    versions: {
      electron: '34.0.0',
      node: '22.0.0',
      chrome: '130.0.0',
    },
    platform: 'win32',
    arch: 'x64',
  },
  clipboard: {
    readText: jest.fn(() => ''),
    writeText: jest.fn(),
  },
  nativeImage: {
    createFromPath: jest.fn(),
    createEmpty: jest.fn(),
  },
  session: {
    defaultSession: {
      setPermissionRequestHandler: jest.fn(),
      webRequest: {
        onHeadersReceived: jest.fn(),
      },
    },
  },
  powerMonitor: {
    on: jest.fn(),
    isOnBatteryPower: jest.fn(() => false),
  },
  screen: {
    getPrimaryDisplay: jest.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      size: { width: 1920, height: 1080 },
    })),
    getAllDisplays: jest.fn(() => []),
  },
};

module.exports = electronMock;
