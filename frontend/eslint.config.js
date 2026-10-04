import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Lint configuration.
 *
 * Deliberately narrow. This project had no linter, so the risk of adding one is
 * burying real defects under thousands of stylistic complaints nobody will fix.
 * The rules below are the ones that catch bugs rather than the ones that catch
 * preferences:
 *
 *   - `no-floating-promises` and `no-misused-promises`, because an unhandled
 *     rejection in this app is a page that silently stops updating;
 *   - the hooks rules, because a stale closure in a live dashboard is a wrong
 *     number rather than a crash;
 *   - `no-explicit-any`, because `any` is how a field rename slips through
 *     typecheck unnoticed.
 *
 * Anything stylistic is left to Prettier, which is already the formatter. Two
 * tools disagreeing about style is worse than one tool ignoring it.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        // Required by the type-aware rules below (`no-floating-promises`,
        // `no-misused-promises`). They are the highest-value checks here, so
        // the project reference is worth the extra lint time rather than
        // dropping them for a faster run.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // The new JSX transform makes these obsolete; requiring them would be
      // noise on every file.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // Unused code is dead weight, but a leading underscore is an explicit
      // statement that the author knows and the signature requires it.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // A promise nobody awaits in a dashboard is a number that quietly stops
      // updating. This is a correctness rule, not a style rule.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // `any` leaking out of a component is how a backend field rename becomes
      // a blank page instead of a type error.
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },

  // Tests are allowed to reach for loose typing and to log; neither is a defect
  // in a spec.
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'no-console': 'off',
    },
  },

  // Config files run in node and legitimately reach for process/fs.
  {
    files: ['*.config.{ts,js}', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);