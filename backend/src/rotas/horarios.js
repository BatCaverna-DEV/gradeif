// Atribuições de um horário (cada horário tem as suas).
//   GET    /api/periodos/:periodoId/versoes/:versaoId/atribuicoes            do horário + fora dele
//   POST   /api/periodos/:periodoId/versoes/:versaoId/atribuicoes            nova, só deste horário
//   PUT    /api/periodos/:periodoId/versoes/:versaoId/atribuicoes/:id        { professores, aulasSemanais, tamanhoBloco, grupoParalelo }
//   DELETE /api/periodos/:periodoId/versoes/:versaoId/atribuicoes/:id        tira do horário (com as aulas)
//   POST   /api/periodos/:periodoId/versoes/:versaoId/atribuicoes/adicionar  { ids: [atribuições da oferta] }
//   POST   /api/periodos/:periodoId/versoes/:versaoId/atribuicoes/:id/restaurar   volta ao que está na oferta
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirPerfil, PERFIS } from '../middlewares/autenticacao.js'
import * as servico from '../servicos/horarios.js'

const rotas = Router({ mergeParams: true })
rotas.use(exigirPerfil(PERFIS.GESTOR))

const id = z.coerce.number().int().positive()
const Horario = z.object({ periodoId: id, versaoId: id })
const Atribuicao = Horario.extend({ id })

rotas.get('/', validar({ params: Horario }), async (req, res) => {
  res.json(await servico.listarAtribuicoes(req.params.periodoId, req.params.versaoId))
})

// Atribuição nova só deste horário.
rotas.post('/', validar({ params: Horario }), async (req, res) => {
  const { periodoId, versaoId } = req.params
  res.status(201).json(await servico.criarAtribuicao(periodoId, versaoId, req.body))
})

rotas.post(
  '/adicionar',
  validar({
    params: Horario,
    body: z.object({ ids: z.array(z.number().int().positive()).min(1) }),
  }),
  async (req, res) => {
    const { periodoId, versaoId } = req.params
    res.status(201).json(await servico.adicionarDaOferta(periodoId, versaoId, req.body.ids))
  }
)

rotas.put('/:id', validar({ params: Atribuicao }), async (req, res) => {
  const { periodoId, versaoId, id: atribuicaoId } = req.params
  res.json(await servico.atualizarAtribuicao(periodoId, versaoId, atribuicaoId, req.body ?? {}))
})

rotas.post('/:id/restaurar', validar({ params: Atribuicao }), async (req, res) => {
  const { periodoId, versaoId, id: atribuicaoId } = req.params
  res.json(await servico.restaurarDaOferta(periodoId, versaoId, atribuicaoId))
})

rotas.delete('/:id', validar({ params: Atribuicao }), async (req, res) => {
  const { periodoId, versaoId, id: atribuicaoId } = req.params
  res.json(await servico.excluirAtribuicao(periodoId, versaoId, atribuicaoId))
})

export default rotas
