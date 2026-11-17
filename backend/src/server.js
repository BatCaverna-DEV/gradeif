import { criarApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { encerrarBanco, verificarBanco } from './db/knex.js'
import { gerenciador } from './geracao/gerenciador.js'

const app = criarApp()

const servidor = app.listen(env.PORT, async () => {
  logger.info(`API de horários ouvindo em http://localhost:${env.PORT}`)
  try {
    await verificarBanco()
    logger.info(`Conectado ao MariaDB em ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`)
  } catch (erro) {
    logger.warn(
      `MariaDB indisponível (${erro.code ?? erro.message}). A API sobe, mas rotas com banco falharão.`
    )
  }
})

async function desligar(sinal) {
  logger.info(`${sinal} recebido, encerrando...`)
  await gerenciador.encerrar()
  servidor.close(async () => {
    await encerrarBanco()
    process.exit(0)
  })
  // Conexões de eventos (SSE) ficam abertas indefinidamente; fecha todas.
  servidor.closeAllConnections()
}

process.on('SIGINT', desligar)
process.on('SIGTERM', desligar)
