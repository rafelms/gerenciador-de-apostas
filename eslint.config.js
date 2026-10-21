import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'apps/web/src/types/database.ts',
      'apps/web/src/components/ui/**', // gerado pelo shadcn/ui
      'supabase/functions/_shared/domain/**', // cópia gerada do shared
      'supabase/functions/**', // Deno: verificado com `deno check`
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Seção 8.7: proibido injetar HTML.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Proibido dangerouslySetInnerHTML (seção 8.7 da spec).',
        },
      ],
    },
  },
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      // O pacote shared só pode depender de zod (roda também no Deno).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!zod$|\\.{1,2}/)',
              message: 'packages/shared só pode importar zod e arquivos locais.',
            },
          ],
        },
      ],
    },
  },
)
