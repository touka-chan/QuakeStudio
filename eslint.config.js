import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Never lint build output, dependencies, or generated files.
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/components.json',
      '**/*.config.{js,cjs,mjs,ts}',
    ],
  },

  // ---- Base -------------------------------------------------------------
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---- Browser app ------------------------------------------------------
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ---- Web Worker / test / node contexts --------------------------------
  {
    files: ['apps/web/src/engine/worker.ts', 'apps/web/tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // ---- shadcn/ui generated primitives -----------------------------------
  // These are vendored from the shadcn registry and committed as-is. They
  // legitimately export variants alongside components, and they are not ours
  // to restyle to satisfy a lint rule.
  {
    files: ['apps/web/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // ---- Node scripts ------------------------------------------------------
  // Root-level config files, plus the standalone Node tools under `tools/`.
  // These are plain `.mjs`, so `no-undef` applies to them as strictly as it
  // does to the config files — `Buffer` and `console` are real globals here,
  // not typos. Linting them as browser code produces noise that trains people
  // to ignore lint output.
  {
    files: ['*.{js,mjs,cjs}', 'tools/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Must stay last so it can disable stylistic rules that conflict.
  prettier,
);
