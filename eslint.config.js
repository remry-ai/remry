// ESLint for TypeScript and Svelte (`bun run lint`, and in CI). The rules beyond the
// recommended sets are the coding conventions in CLAUDE.md that a linter can check.

import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
  {
    ignores: ['build/', 'dist/', '.svelte-kit/', 'generated/', 'data/', 'node_modules/', 'static/', 'coverage/']
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, Bun: 'readonly' }
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'], svelteConfig }
    }
  },
  {
    rules: {
      // TypeScript checks these, with types.
      'no-undef': 'off',
      // No `any`: use `unknown` and narrow.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // `const` arrow functions over function declarations.
      'func-style': ['error', 'expression'],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      // The app has no base path, so links don't need resolve() from $app/paths.
      'svelte/no-navigation-without-resolve': 'off',
      // Maps and Sets here are built inside $derived or replaced whole on change, which
      // Svelte tracks; SvelteMap and SvelteSet are for mutating one in place.
      'svelte/prefer-svelte-reactivity': 'off'
    }
  }
);
