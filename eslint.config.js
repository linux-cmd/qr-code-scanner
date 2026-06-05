import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.wrangler/**', 'test-results/**', 'playwright-report/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json'
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        FileReader: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLVideoElement: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        console: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        AbortController: 'readonly',
        clearTimeout: 'readonly',
        createImageBitmap: 'readonly',
        crypto: 'readonly',
        FormData: 'readonly',
        KVNamespace: 'readonly',
        PagesFunction: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules
    }
  },
  {
    files: ['scripts/**/*.mjs', 'playwright.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly'
      }
    }
  }
];
