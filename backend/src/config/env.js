import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// Carrega backend/.env quando existir. Variáveis já definidas no ambiente têm
// prioridade, então PM2 ou o shell podem sobrescrever qualquer valor.
const arquivoEnv = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv)

// Toda configuração entra por variável de ambiente e é validada na inicialização.
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(8).default('segredo-de-desenvolvimento'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('horarios'),
  GESTOR_NOME: z.string().default('Gestor de Horários'),
  GESTOR_EMAIL: z.string().email().default('gestor@horarios.local'),
  GESTOR_SENHA: z.string().min(6).default('trocar123'),
  // Pasta do build do Vue (frontend/dist) para a API servir a interface. Opcional.
  FRONTEND_DIST: z.string().optional(),
})

const resultado = esquema.safeParse(process.env)

if (!resultado.success) {
  const erros = resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Variáveis de ambiente inválidas:\n${erros}`)
}

export const env = resultado.data

if (env.NODE_ENV === 'production' && env.SESSION_SECRET === 'segredo-de-desenvolvimento') {
  throw new Error('Defina SESSION_SECRET em produção.')
}
