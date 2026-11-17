import { defineConfig } from 'vitest/config'

// Os testes usam a base horarios_test, criada e migrada em test/setup-banco.js.
// Sem MariaDB no ar, os testes de banco são pulados e os demais rodam normalmente.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js', 'src/**/*.test.js'],
    env: { NODE_ENV: 'test', DB_NAME: 'horarios_test' },
    globalSetup: ['./test/setup-banco.js'],
    fileParallelism: false, // os arquivos compartilham a mesma base de teste
  },
})
