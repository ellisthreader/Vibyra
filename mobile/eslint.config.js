const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  globalIgnores(['dist/**', 'src/generated/**']),
  expoConfig,
  {
    files: ['scripts/**/*.{js,cjs,mjs}', '*.{js,cjs,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true } },
    rules: { '@typescript-eslint/no-floating-promises': 'error' },
  },
  {
    // Existing external-store refs and event-owned state intentionally fall outside
    // React Compiler's static optimization. Keep Rules of Hooks and dependency
    // diagnostics active while these flows are refactored feature by feature.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
    },
  },
]);
