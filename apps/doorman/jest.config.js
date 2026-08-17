const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../..');

/** @type {import('jest').Config} */
module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The preset defaults to iOS, but this app is Android-only (no `ios/`).
  // Without this, tests resolve `*.ios.js` module variants and see
  // `Platform.OS === 'ios'`.
  haste: {
    defaultPlatform: 'android',
    platforms: ['android', 'native'],
  },
  moduleNameMapper: {
    // Mirror the tsconfig path alias so tests import the workspace package the
    // same way the app does (TypeScript source, no build step).
    '^@virtualdoorman/types$': path.join(
      workspaceRoot,
      'packages/types/src/index.ts',
    ),
  },
};
