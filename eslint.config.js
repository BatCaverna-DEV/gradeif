import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  js.configs.recommended,
  // Só regras de correção do Vue; a formatação fica com o Prettier.
  ...pluginVue.configs['flat/essential'],
  {
    rules: {
      // Prefixo _ marca um valor descartado de propósito (ex.: tirar um campo com rest).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // Configuração do PM2 (CommonJS).
    files: ['*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['backend/**/*.js', '*.config.js', 'frontend/*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['frontend/**/*.{js,vue}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]
