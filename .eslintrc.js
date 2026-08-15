/**
 * Repo-wide ESLint config. One config for every workspace so `yarn lint`
 * (run from the repo root) covers apps/* and packages/* alike.
 *
 * `@react-native` already extends eslint-config-prettier, so ESLint stays out
 * of formatting; `prettier --check` (part of `yarn lint`) owns that.
 */
module.exports = {
  root: true,
  extends: ['@react-native'],
  ignorePatterns: [
    'node_modules/',
    '.yarn/',
    'coverage/',
    'apps/*/android/',
    '**/*.d.ts',
  ],
  overrides: [
    {
      // Plain CommonJS config/entry files: no Babel config at the repo root,
      // and nothing Flow-typed to parse.
      files: ['*.js'],
      parserOptions: { requireConfigFile: false },
    },
    {
      // The RN config only marks `*.{spec,test}.*` and `__tests__` as Jest;
      // the shared setup file needs the same globals.
      files: ['**/jest.setup.js'],
      env: { jest: true },
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        // Unused vars are also reported by tsc; keep a single, consistent
        // signal and allow the conventional `_`-prefixed escape hatch.
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
  ],
};
