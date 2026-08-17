/**
 * Repo-wide ESLint config. One config for every workspace so `yarn lint`
 * (run from the repo root) covers apps/* and packages/* alike.
 *
 * `prettier` (eslint-config-prettier) is listed last so ESLint stays out of
 * formatting entirely; `prettier --check` (part of `yarn lint`) owns that.
 * `@react-native` extends it too, but only the copy pinned in its own
 * dependency range — naming it here makes the root devDependency the one that
 * actually applies, and keeps the guarantee if that transitive extend is ever
 * dropped.
 */
module.exports = {
  root: true,
  extends: ['@react-native', 'prettier'],
  ignorePatterns: [
    'node_modules/',
    '.yarn/',
    'coverage/',
    'apps/*/android/',
    // ESLint 8 skips every dot-prefixed file when it walks a directory, so
    // `eslint .` silently reported success on `.prettierrc.js` and would do the
    // same for any `.babelrc.js`/`.*.js` added later. Re-include them; the
    // directory ignores above still win for anything inside `.yarn/`.
    '!.*.js',
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
