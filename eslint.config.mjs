import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      '.vite/',
      'out/',
      'coverage/',
      '**/*.config.ts',
      '**/*.config.mjs',
      '**/*.config.js',
      'postcss.config.js',
      'test/',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'import-x': importX,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',

      // React rules
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',

      // Import ordering
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
          'newlines-between': 'never',
          alphabetize: { order: 'asc' },
        },
      ],
      'import-x/no-duplicates': 'error',
    },
  },
);
