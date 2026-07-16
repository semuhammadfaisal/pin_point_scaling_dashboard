module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'controllers/**/*.js', 'middleware/**/*.js', 'services/**/*.js', 'utils/**/*.js',
    '!services/hotProspectorAuthService.js',
  ],
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 30000,
};
