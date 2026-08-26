import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Kod kalitesi kurallari.
 *
 * Depoda `eslint-disable` yorumlari bastan beri vardi ama ne bagimlilik ne de
 * yapilandirma bulunuyordu; yani hicbir kural calismiyordu.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      'web/public/**',
      '**/*.config.js',
      'server/prisma/seed.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Kasitli olarak kullanilmayan degiskenler _ ile isaretlenir.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Prisma delegate'leri gibi yerlerde bilincli olarak any kullaniliyor.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Bos catch bloklari (localStorage erisimi gibi) bilerek kullaniliyor.
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },

  // React kurallari: eslint-disable yorumlari zaten bunlara isaret ediyordu
  // ama eklenti kurulu olmadigi icin hicbiri calismiyordu.
  {
    files: ['web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Testlerde gevsetilen kurallar
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
