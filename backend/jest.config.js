module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/tests/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
