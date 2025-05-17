// jest.setup.ts
// Store original console methods
const consoleOriginal = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

// Replace console methods with no-op functions for testing
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();
});

// Restore original console methods after all tests
afterAll(() => {
  console.log = consoleOriginal.log;
  console.error = consoleOriginal.error;
  console.warn = consoleOriginal.warn;
  console.info = consoleOriginal.info;
  console.debug = consoleOriginal.debug;
}); 