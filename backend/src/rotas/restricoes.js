// Catálogo de restrições (leitura) e configuração por período (F3-01).
//   GET  /api/restricoes/catalogo
//   GET  /api/periodos/:periodoId/restricoes
//   PUT  /api/periodos/:periodoId/restricoes/:codigo   { ativa?, peso?, parametros? }
//   POST /api/periodos/:periodoId/restricoes/restaurar
import { Router } from 'express'
import { z } from 'zod'
import { CATALOGO } from '../core/restricoes/catalogo.js'
import { validar } from '../middlewares/validar.js'
import { exigirPerfil, PERFIS } from '../middlewares/autenticacao.js'
import * as servico from '../servicos/restricoes.js'

const rotas = Router()

rotas.get('/catalogo', (_req, res) => {
  res.json(CATALOGO)
})

export const rotasDoPeriodo = Router({ mergeParams: true })
rotasDoPeriodo.use(exigirPerfil(PERFIS.GESTOR))

const Periodo = z.object({ periodoId: z.coerce.number().int().positive() })

rotasDoPeriodo.get('/', validar({ params: Periodo }), async (req, res) => {
  res.json(await servico.listarRestricoes(req.params.periodoId))
})

rotasDoPeriodo.post('/restaurar', validar({ params: Periodo }), async (req, res) => {
  res.json(await servico.restaurarPadrao(req.params.periodoId))
})

rotasDoPeriodo.put(
  '/:codigo',
  validar({ params: Periodo.extend({ codigo: z.string().toUpperCase() }) }),
  async (req, res) => {
    res.json(
      await servico.atualizarRestricao(req.params.periodoId, req.params.codigo, req.body ?? {})
    )
  }
)

export default rotas
