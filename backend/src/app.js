import { existsSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { rotaNaoEncontrada, tratarErros } from './middlewares/erros.js'
import rotasSaude from './rotas/saude.js'
import rotasAuth from './rotas/auth.js'
import rotasPeriodos from './rotas/periodos.js'
import rotasRestricoes, { rotasDoPeriodo as rotasRestricoesDoPeriodo } from './rotas/restricoes.js'
import rotasGeracao from './rotas/geracao.js'
import rotasVersoes from './rotas/versoes.js'
import rotasEdicao from './rotas/edicao.js'
import rotasHorarios from './rotas/horarios.js'
import { rotasDoPeriodo as rotasImportacoes, rotasModelos } from './rotas/importacoes.js'
import rotasDados from './rotas/dados.js'
import rotasPublico from './rotas/publico.js'
import rotasDisponibilidade from './rotas/disponibilidade.js'
import rotasUsuarios from './rotas/usuarios.js'
import { armazemPadrao } from './db/sessoes.js'

// Cria a aplicação sem abrir porta, para que os testes usem supertest diretamente.
// armazem: onde guardar as sessões. Fora dos testes, a tabela "sessao"; nos testes,
// o MemoryStore, salvo quando o teste passa um armazém.
export function criarApp({ armazem = armazemPadrao() } = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1) // Apache como proxy reverso em produção

  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ status: res.statusCode }),
        },
      })
    )
  }

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
  app.use(express.json({ limit: '2mb' }))

  // Sessão por cookie HTTP-only, guardada na tabela "sessao" (db/sessoes.js).
  app.use(
    session({
      name: 'horarios.sid',
      store: armazem ?? undefined,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 8, // 8 horas
      },
    })
  )

  app.use('/api/saude', rotasSaude)
  app.use('/api/auth', rotasAuth)
  app.use('/api/periodos', rotasPeriodos)
  app.use('/api/restricoes', rotasRestricoes)
  app.use('/api/periodos/:periodoId/importacoes', rotasImportacoes)
  app.use('/api/importacoes/modelos', rotasModelos)
  app.use('/api/periodos/:periodoId/dados', rotasDados)
  app.use('/api/periodos/:periodoId/restricoes', rotasRestricoesDoPeriodo)
  app.use('/api/periodos/:periodoId/geracao', rotasGeracao)
  app.use('/api/periodos/:periodoId/versoes/:versaoId/edicao', rotasEdicao)
  app.use('/api/periodos/:periodoId/versoes/:versaoId/atribuicoes', rotasHorarios)
  app.use('/api/periodos/:periodoId/versoes', rotasVersoes)
  app.use('/api/periodos/:periodoId/disponibilidade', rotasDisponibilidade)
  app.use('/api/publico', rotasPublico)
  app.use('/api/usuarios', rotasUsuarios)
  app.use('/api', rotaNaoEncontrada)

  // Em produção, a própria API pode servir a interface compilada (FRONTEND_DIST).
  // Rotas que não são arquivo nem /api devolvem o index.html (rotas do Vue).
  if (env.FRONTEND_DIST && existsSync(env.FRONTEND_DIST)) {
    const pasta = path.resolve(env.FRONTEND_DIST)
    app.use(express.static(pasta, { index: false, maxAge: '1h' }))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(pasta, 'index.html')))
  }

  app.use(rotaNaoEncontrada)
  app.use(tratarErros)

  return app
}
