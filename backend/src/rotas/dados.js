// F1-21 — Consulta e correção pontual dos cadastros de um período.
//   GET    /api/periodos/:periodoId/dados/:entidade
//   POST   /api/periodos/:periodoId/dados/:entidade          (professores, disciplinas e turmas)
//   PUT    /api/periodos/:periodoId/dados/:entidade/:id
//   DELETE /api/periodos/:periodoId/dados/:entidade/:id
// entidade: professores, turmas, disciplinas, atribuicoes ou salas.
// Professores, disciplinas e salas são compartilhados entre períodos; o período
// serve para os indicadores (carga atribuída, número de atribuições).
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirPerfil, PERFIS } from '../middlewares/autenticacao.js'
import * as servico from '../servicos/dados.js'

const rotas = Router({ mergeParams: true })
rotas.use(exigirPerfil(PERFIS.GESTOR))

const Lista = z.object({
  periodoId: z.coerce.number().int().positive(),
  entidade: z.enum(servico.NOMES_ENTIDADES),
})
const Registro = Lista.extend({ id: z.coerce.number().int().positive() })

rotas.get('/:entidade', validar({ params: Lista }), async (req, res) => {
  res.json(await servico.listar(req.params.entidade, req.params.periodoId))
})

rotas.post('/:entidade', validar({ params: Lista }), async (req, res) => {
  res.status(201).json(await servico.criar(req.params.entidade, req.params.periodoId, req.body))
})

rotas.put('/:entidade/:id', validar({ params: Registro }), async (req, res) => {
  const { entidade, periodoId, id } = req.params
  res.json(await servico.atualizar(entidade, periodoId, id, req.body))
})

rotas.delete('/:entidade/:id', validar({ params: Registro }), async (req, res) => {
  const { entidade, periodoId, id } = req.params
  await servico.excluir(entidade, periodoId, id)
  res.status(204).end()
})

export default rotas
