// F3-03 e F3-04 — Geração da grade pelo solver.
//   GET  /api/periodos/:periodoId/geracao            job atual (ou null)
//   POST /api/periodos/:periodoId/geracao            inicia { versaoId, tempoLimiteSegundos, semente? } no horário escolhido
//   POST /api/periodos/:periodoId/geracao/cancelar   { salvar?: boolean }
//   GET  /api/periodos/:periodoId/geracao/eventos    Server-Sent Events (evento "job")
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirEditorDoHorario, exigirPerfil, PERFIS } from '../middlewares/autenticacao.js'
import { gerenciador } from '../geracao/gerenciador.js'

const rotas = Router({ mergeParams: true })
rotas.use(exigirPerfil(PERFIS.GESTOR))

const Periodo = z.object({ periodoId: z.coerce.number().int().positive() })

const Iniciar = z.object({
  tempoLimiteSegundos: z
    .number({ error: 'Informe o tempo limite em segundos' })
    .int()
    .min(1, 'O tempo limite mínimo é 1 segundo')
    .max(1800, 'O tempo limite máximo é 30 minutos')
    .default(60),
  semente: z.string().trim().max(40).optional(),
  versaoId: z.number({ error: 'Escolha o horário a gerar' }).int().positive(),
})

const INTERVALO_PULSO_MS = 15_000

rotas.get('/', validar({ params: Periodo }), (req, res) => {
  res.json({ job: gerenciador.obter(req.params.periodoId) })
})

// Gerar e cancelar a geração de um horário: só o editor dele.
rotas.post(
  '/',
  validar({ params: Periodo, body: Iniciar }),
  exigirEditorDoHorario((req) => req.body.versaoId),
  async (req, res) => {
    res.status(202).json({ job: await gerenciador.iniciar(req.params.periodoId, req.body) })
  }
)

rotas.post(
  '/cancelar',
  validar({ params: Periodo, body: z.object({ salvar: z.boolean().default(false) }) }),
  exigirEditorDoHorario((req) => {
    const job = gerenciador.obter(req.params.periodoId)
    return job?.ativo ? job.opcoes.versaoId : null
  }),
  (req, res) => {
    res.json({ job: gerenciador.cancelar(req.params.periodoId, req.body) })
  }
)

rotas.get('/eventos', validar({ params: Periodo }), (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Proxies (Apache/nginx) não devem segurar os eventos em buffer.
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  const enviar = (job) => res.write(`event: job\ndata: ${JSON.stringify({ job })}\n\n`)
  enviar(gerenciador.obter(req.params.periodoId))
  const sair = gerenciador.assinar(req.params.periodoId, enviar)
  const pulso = setInterval(() => res.write(': pulso\n\n'), INTERVALO_PULSO_MS)
  req.on('close', () => {
    clearInterval(pulso)
    sair()
  })
})

export default rotas
