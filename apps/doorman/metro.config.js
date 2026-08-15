const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Metro configuration — monorepo aware.
 * https://reactnative.dev/docs/metro
 *
 * Workspace packages (`@virtualdoorman/types`) are consumed as TypeScript
 * source, so Metro has to watch the whole repo and resolve modules from both
 * the app's own `node_modules` and the hoisted root one.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // Hierarchical lookup stays on: Yarn nests a few transitive deps inside
    // their dependent's own node_modules (e.g. react-native/node_modules/semver),
    // and those are only reachable by walking up from the requiring module.
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
