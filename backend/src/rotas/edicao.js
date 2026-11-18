// Fase 4 — Editor manual de uma versão.
//   GET    .../edicao                 aulas, avaliação e aulas que faltam alocar
//   POST   .../edicao/simular         { aulaId } ou { atribuicaoId } → situação de cada horário
//   POST   .../edicao/posicionar      { movimentos: [{ aulaId, horarioId, salaId, revisar? }] }
//   POST   .../edicao/trocar          { aulaA, aulaB }
//   POST   .../edicao/aulas           { atribuicaoId, horarioId, salaId, fixada?, revisar? }
//   DELETE .../edicao/aulas/:aulaId
//   PUT    .../edicao/aulas/:aulaId   { fixada?, revisar? }
// Prefixo: /api/periodos/:periodoId/versoes/:versaoId
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirEditorDoHorario, exigirPerfil, PERFIS } from '../middlewares/autenticacao.js'
import * as servico from '../servicos/edicao.js'

const rotas = Router({ mergeParams: true })
rotas.use(exigirPerfil(PERFIS.GESTOR))
// Consultar e simular: qualquer gestor. Alterar: só o editor do horário.
rotas.use(
  exigirEditorDoHorario((req) =>
    req.method === 'GET' || req.path === '/simular' ? null : req.params.versaoId
  )
)

const id = z.coerce.number().int().positive()
const Versao = z.object({ periodoId: id, versaoId: id })
const Aula = Versao.extend({ aulaId: id })
const idCorpo = z.number().int().positive()
const Destino = z.object({ horarioId: idCorpo, salaId: idCorpo.nullable().default(null) })

rotas.get('/', validar({ params: Versao }), async (req, res) => {
  res.json(await servico.estadoDoEditor(req.params.periodoId, req.params.versaoId))
})

rotas.post(
  '/simular',
  validar({
    params: Versao,
    body: z
      .object({ aulaId: idCorpo.optional(), atribuicaoId: idCorpo.optional() })
      .refine((b) => (b.aulaId == null) !== (b.atribuicaoId == null), {
        message: 'Informe aulaId ou atribuicaoId',
      }),
  }),
  async (req, res) => {
    res.json(await servico.simular(req.params.periodoId, req.params.versaoId, req.body))
  }
)

rotas.post(
  '/posicionar',
  validar({
    params: Versao,
    body: z.object({
      movimentos: z
        .array(Destino.extend({ aulaId: idCorpo, revisar: z.boolean().optional() }))
        .min(1)
        .max(50),
    }),
  }),
  async (req, res) => {
    res.json(
      await servico.posicionar(req.params.periodoId, req.params.versaoId, req.body.movimentos)
    )
  }
)

rotas.post(
  '/trocar',
  validar({ params: Versao, body: z.object({ aulaA: idCorpo, aulaB: idCorpo }) }),
  async (req, res) => {
    const { aulaA, aulaB } = req.body
    res.json(await servico.trocar(req.params.periodoId, req.params.versaoId, aulaA, aulaB))
  }
)

rotas.post(
  '/aulas',
  validar({
    params: Versao,
    body: Destino.extend({
      atribuicaoId: idCorpo,
      fixada: z.boolean().optional(),
      revisar: z.boolean().optional(),
    }),
  }),
  async (req, res) => {
    res
      .status(201)
      .json(await servico.criarAula(req.params.periodoId, req.params.versaoId, req.body))
  }
)

rotas.delete('/aulas/:aulaId', validar({ params: Aula }), async (req, res) => {
  const { periodoId, versaoId, aulaId } = req.params
  res.json(await servico.removerAula(periodoId, versaoId, aulaId))
})

rotas.put(
  '/aulas/:aulaId',
  validar({
    params: Aula,
    body: z.object({ fixada: z.boolean().optional(), revisar: z.boolean().optional() }),
  }),
  async (req, res) => {
    const { periodoId, versaoId, aulaId } = req.params
    res.json(await servico.marcarAula(periodoId, versaoId, aulaId, req.body))
  }
)

export default rotas
