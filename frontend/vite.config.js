import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const pasta = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  // API_URL: para onde o Vite encaminha /api em desenvolvimento. Vem do terminal
  // ou de frontend/.env, .env.local, .env.[modo]... (o terminal tem prioridade).
  // Ver frontend/.env.example.
  const env = loadEnv(mode, pasta, '')
  const apiUrl = process.env.API_URL || env.API_URL || 'http://localhost:3333'

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // Em desenvolvimento, /api vai para a API; o cookie de sessão fica na mesma origem.
      proxy: {
        '/api': { target: apiUrl, changeOrigin: true },
      },
    },
  }
})
