// Jest setup file - runs before each test file
// Configures global mocks and test environment

// Increase timeout for async operations
jest.setTimeout(30000);

// Mock console.error to catch unexpected errors but don't fail tests
// const originalConsoleError = console.error;
// console.error = (...args: unknown[]) => {
//   // Only fail on actual test errors, not warnings
//   if (args[0] && typeof args[0] === 'string' && args[0].includes('Error')) {
//     originalConsoleError(...args);
//   }
// };

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Global afterAll to clean up
afterAll(() => {
  jest.restoreAllMocks();
});
