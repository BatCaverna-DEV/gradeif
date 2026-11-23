// F5-07 e F5-08 — Disponibilidade por período e por horário.
//   GET  /api/periodos/:periodoId/disponibilidade/professores?versao=ID        resumo
//   GET  /api/periodos/:periodoId/disponibilidade/turmas?versao=ID             tempos fechados de cada turma
//   GET  /api/periodos/:periodoId/disponibilidade/:tipo/:recursoId?versao=ID
//   PUT  /api/periodos/:periodoId/disponibilidade/:tipo/:recursoId?versao=ID   { itens: [...] }
//   POST /api/periodos/:periodoId/disponibilidade/:tipo/:recursoId/usar-padrao?versao=ID
// Com ?versao, a disponibilidade daquele horário; sem ela, o padrão do período (o
// que os professores informam). tipo: professor, turma ou sala. O professor só
// acessa a própria disponibilidade, no padrão do período.
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirEditorDoHorario, exigirLogin } from '../middlewares/autenticacao.js'
import { ErroProibido } from '../erros.js'
import * as servico from '../servicos/disponibilidade.js'

const rotas = Router({ mergeParams: true })
rotas.use(exigirLogin)

const id = z.coerce.number().int().positive()
const Periodo = z.object({ periodoId: id })
const Recurso = Periodo.extend({ tipo: z.enum(servico.TIPOS), recursoId: id })
const Escopo = z.object({ versao: id.optional() })
const Itens = z.object({
  itens: z
    .array(
      z.object({
        horarioId: z.number().int().positive(),
        rigida: z.boolean(),
        motivo: z.string().max(200).nullable().optional(),
      })
    )
    .max(500),
})

const versaoDa = (req) => req.validatedQuery.versao ?? null
// A disponibilidade de um horário (?versao) só é alterada pelo editor dele.
const doEditor = exigirEditorDoHorario(versaoDa)

rotas.get('/professores', validar({ params: Periodo, query: Escopo }), async (req, res) => {
  if (versaoDa(req)) servico.verificarAcesso(req.session.usuario, 'professor', 0, versaoDa(req))
  res.json(
    await servico.resumoProfessores(req.params.periodoId, req.session.usuario, versaoDa(req))
  )
})

// Tempos fechados de todas as turmas (para o editor e a visualização da grade).
rotas.get('/turmas', validar({ params: Periodo, query: Escopo }), async (req, res) => {
  if (req.session.usuario.perfil !== 'gestor')
    throw new ErroProibido('A disponibilidade das turmas é consultada pelo gestor')
  res.json(await servico.indisponiveisDasTurmas(req.params.periodoId, versaoDa(req)))
})

rotas.get('/:tipo/:recursoId', validar({ params: Recurso, query: Escopo }), async (req, res) => {
  const { periodoId, tipo, recursoId } = req.params
  servico.verificarAcesso(req.session.usuario, tipo, recursoId, versaoDa(req))
  res.json(await servico.obterDisponibilidade(periodoId, tipo, recursoId, versaoDa(req)))
})

rotas.put(
  '/:tipo/:recursoId',
  validar({ params: Recurso, query: Escopo, body: Itens }),
  doEditor,
  async (req, res) => {
    const { periodoId, tipo, recursoId } = req.params
    servico.verificarAcesso(req.session.usuario, tipo, recursoId, versaoDa(req))
    res.json(
      await servico.definirDisponibilidade(
        periodoId,
        tipo,
        recursoId,
        req.body.itens,
        versaoDa(req)
      )
    )
  }
)

rotas.post(
  '/:tipo/:recursoId/usar-padrao',
  validar({ params: Recurso, query: z.object({ versao: id }) }),
  doEditor,
  async (req, res) => {
    const { periodoId, tipo, recursoId } = req.params
    servico.verificarAcesso(req.session.usuario, tipo, recursoId, versaoDa(req))
    res.json(await servico.copiarDoPadrao(periodoId, tipo, recursoId, versaoDa(req)))
  }
)

export default rotas
