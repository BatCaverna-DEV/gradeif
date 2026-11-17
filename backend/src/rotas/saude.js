import { Router } from 'express'
import { verificarBanco } from '../db/knex.js'

const rotas = Router()

// Rota de saúde: responde mesmo com o banco fora, informando a situação de cada parte.
rotas.get('/', async (_req, res) => {
  let banco = 'ok'
  try {
    await verificarBanco()
  } catch {
    banco = 'indisponivel'
  }
  res.status(banco === 'ok' ? 200 : 503).json({
    api: 'ok',
    banco,
    versao: process.env.npm_package_version ?? '0.1.0',
    horario: new Date().toISOString(),
  })
})

export default rotas
