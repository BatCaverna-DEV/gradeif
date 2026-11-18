// F1-17/F1-18/F1-20 — Rotas de importação de planilhas.
//   GET  /api/importacoes/modelos/:tipo                 planilha-modelo (XLSX)
//   POST /api/periodos/:periodoId/importacoes/previa    prévia, sem gravar
//   POST /api/periodos/:periodoId/importacoes           confirma e grava (mesmos arquivos da prévia)
//   GET  /api/periodos/:periodoId/importacoes           histórico
//   GET  /api/periodos/:periodoId/importacoes/:id       relatório de uma importação
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirEditorDoHorario, exigirPerfil, PERFIS } from '../middlewares/autenticacao.js'
import { ErroValidacao } from '../erros.js'
import { TIPOS } from '../importacao/planilhas.js'
import { gerarModelo, NOMES_ARQUIVO } from '../importacao/modelos.js'
import * as servico from '../servicos/importacoes.js'

export const LIMITE_ARQUIVO = 5 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_ARQUIVO, files: 5 },
  defParamCharset: 'utf8', // nomes de arquivo com acento
})

const PeriodoParams = z.object({ periodoId: z.coerce.number().int().positive() })
// ?versao=ID: importa também nas atribuições desse horário.
const DestinoQuery = z.object({ versao: z.coerce.number().int().positive().optional() })
const DetalheParams = PeriodoParams.extend({ id: z.coerce.number().int().positive() })

function arquivosDaRequisicao(req) {
  if (!req.files?.length)
    throw new ErroValidacao(null, 'Envie ao menos um arquivo no campo "arquivos"')
  return req.files.map((f) => ({ nome: f.originalname, buffer: f.buffer }))
}

// ---------- Rotas por período ----------
export const rotasDoPeriodo = Router({ mergeParams: true })
rotasDoPeriodo.use(exigirPerfil(PERFIS.GESTOR))

rotasDoPeriodo.post(
  '/previa',
  upload.array('arquivos', 5),
  validar({ params: PeriodoParams, query: DestinoQuery }),
  async (req, res) => {
    res.json(
      await servico.previa(req.params.periodoId, arquivosDaRequisicao(req), {
        versaoId: req.validatedQuery.versao ?? null,
      })
    )
  }
)

rotasDoPeriodo.post(
  '/',
  upload.array('arquivos', 5),
  validar({ params: PeriodoParams, query: DestinoQuery }),
  // Importar num horário (?versao) altera as atribuições dele: só o editor.
  exigirEditorDoHorario((req) => req.validatedQuery.versao ?? null),
  async (req, res) => {
    const resultado = await servico.confirmar(
      req.params.periodoId,
      arquivosDaRequisicao(req),
      req.session.usuario.id,
      { versaoId: req.validatedQuery.versao ?? null }
    )
    res.status(201).json(resultado)
  }
)

rotasDoPeriodo.get('/', validar({ params: PeriodoParams }), async (req, res) => {
  res.json(await servico.historico(req.params.periodoId))
})

rotasDoPeriodo.get('/:id', validar({ params: DetalheParams }), async (req, res) => {
  res.json(await servico.detalhe(req.params.periodoId, req.params.id))
})

// ---------- Modelos ----------
export const rotasModelos = Router()
rotasModelos.use(exigirPerfil(PERFIS.GESTOR))

rotasModelos.get('/', (_req, res) => {
  res.json(TIPOS.map((tipo) => ({ tipo, arquivo: NOMES_ARQUIVO[tipo] })))
})

rotasModelos.get(
  '/:tipo',
  validar({ params: z.object({ tipo: z.enum(TIPOS) }) }),
  async (req, res) => {
    const buffer = await gerarModelo(req.params.tipo)
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .attachment(`modelo-${NOMES_ARQUIVO[req.params.tipo]}`)
      .send(buffer)
  }
)
