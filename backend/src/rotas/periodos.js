// F1-14 — CRUD de período letivo e configuração de turnos e tempos de aula.
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirLogin, exigirPerfil, PERFIS } from '../middlewares/autenticacao.js'
import * as servico from '../servicos/periodos.js'
import { montarProblema } from '../servicos/problema.js'
import { painelDoPeriodo } from '../servicos/painel.js'

const rotas = Router()

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD')
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM')

const IdParams = z.object({ id: z.coerce.number().int().positive() })

const PeriodoBase = z.object({
  nome: z.string().trim().min(1).max(20),
  dataInicio: data,
  dataFim: data,
})

const CriarPeriodo = PeriodoBase.refine((p) => p.dataInicio <= p.dataFim, {
  message: 'A data de início deve ser anterior à data de fim',
  path: ['dataFim'],
})

const AtualizarPeriodo = PeriodoBase.partial().extend({
  situacao: z.enum(['planejamento', 'publicado', 'encerrado']).optional(),
})

export const GradeHorariaSchema = z.object({
  dias: z
    .array(z.number().int().min(1).max(7))
    .min(1, 'Informe ao menos um dia letivo')
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  turnos: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(30),
        ordem: z.number().int().min(1).optional(),
        tempos: z
          .array(
            z.object({ horaInicio: hora, horaFim: hora }).refine((t) => t.horaInicio < t.horaFim, {
              message: 'Hora de início deve ser anterior à de fim',
            })
          )
          .min(1, 'Cada turno precisa de ao menos um tempo de aula'),
      })
    )
    .min(1, 'Informe ao menos um turno'),
})

rotas.use(exigirLogin)

rotas.get('/', async (_req, res) => {
  res.json(await servico.listarPeriodos())
})

rotas.get('/:id', validar({ params: IdParams }), async (req, res) => {
  res.json(await servico.obterPeriodo(req.params.id))
})

rotas.post('/', exigirPerfil(PERFIS.GESTOR), validar({ body: CriarPeriodo }), async (req, res) => {
  res.status(201).json(await servico.criarPeriodo(req.body))
})

rotas.put(
  '/:id',
  exigirPerfil(PERFIS.GESTOR),
  validar({ params: IdParams, body: AtualizarPeriodo }),
  async (req, res) => {
    res.json(await servico.atualizarPeriodo(req.params.id, req.body))
  }
)

rotas.delete(
  '/:id',
  exigirPerfil(PERFIS.GESTOR),
  validar({ params: IdParams }),
  async (req, res) => {
    await servico.excluirPeriodo(req.params.id)
    res.status(204).end()
  }
)

rotas.get('/:id/grade-horaria', validar({ params: IdParams }), async (req, res) => {
  res.json(await servico.obterGradeHoraria(req.params.id))
})

rotas.put(
  '/:id/grade-horaria',
  exigirPerfil(PERFIS.GESTOR),
  validar({ params: IdParams, body: GradeHorariaSchema }),
  async (req, res) => {
    res.json(await servico.definirGradeHoraria(req.params.id, req.body))
  }
)

// F3-11 — Situação do período para o painel.
rotas.get(
  '/:id/painel',
  exigirPerfil(PERFIS.GESTOR),
  validar({ params: IdParams }),
  async (req, res) => {
    res.json(await painelDoPeriodo(req.params.id))
  }
)

// F2-16 — Problema do período no formato do núcleo, para a linha de comando do
// solver (npm run resolver -w backend -- arquivo.json). ?versao=ID traz as aulas
// fixadas daquela versão.
rotas.get(
  '/:id/problema',
  exigirPerfil(PERFIS.GESTOR),
  validar({
    params: IdParams,
    query: z.object({ versao: z.coerce.number().int().positive().optional() }),
  }),
  async (req, res) => {
    const { problema, avisos } = await montarProblema(req.params.id, {
      versaoId: req.validatedQuery.versao,
    })
    res.json({ ...problema, avisos })
  }
)

export default rotas
