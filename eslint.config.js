import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
    },
  },
  // Legacy adapters deliberately consume the deprecated contracts retained for compatibility.
  { files: ['packages/contracts/src/plan.ts', 'packages/plan/src/{features,planner,types}.ts', 'packages/render/src/{voiceover,filtergraph}.ts'], rules: { '@typescript-eslint/no-deprecated': 'off' } },
  { files: ['**/*.config.ts', 'packages/playwright/examples/*.ts'], languageOptions: { parserOptions: { projectService: false, project: './tsconfig.tools.json' } } },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.mjs', '**/.repro/**', '**/test-results/**', 'eslint.config.js'],
  },
);
