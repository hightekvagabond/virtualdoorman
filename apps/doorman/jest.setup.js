/**
 * Jest setup: stub the native modules the scaffold touches, so tests run on
 * plain Node without a device.
 */

// react-native-config reads values baked in at build time from .env.*; in
// tests we pin the development defaults.
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: { ENV_NAME: 'development', LOG_LEVEL: 'debug' },
}));

// Ships its own jest mock (every export is a jest.fn); device locale is en-US.
jest.mock('react-native-localize', () =>
  require('react-native-localize/mock/jest'),
);

// Ships its own jest mock as a default export (fixed insets, no native view).
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
