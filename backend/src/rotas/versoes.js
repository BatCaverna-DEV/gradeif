// F3-05, F3-08 e F3-10 — Versões da grade de um período.
//   GET    /api/periodos/:periodoId/versoes
//   GET    /api/periodos/:periodoId/versoes/:id
//   GET    /api/periodos/:periodoId/versoes/:id/aulas
//   GET    /api/periodos/:periodoId/versoes/:id/avaliacao
//   PUT    /api/periodos/:periodoId/versoes/:id            { nome }
//   POST   /api/periodos/:periodoId/versoes/:id/duplicar   { nome? }
//   DELETE /api/periodos/:periodoId/versoes/:id
//   POST   /api/periodos/:periodoId/versoes/:id/publicar      { forcar? }   (F5-01)
//   POST   /api/periodos/:periodoId/versoes/:id/despublicar
//   GET    /api/periodos/:periodoId/versoes/:id/exportar/pdf?tipo=turma|professor|sala|campus&recurso=ID
//   GET    /api/periodos/:periodoId/versoes/:id/exportar/xlsx                  (F5-02 a F5-04)
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../middlewares/validar.js'
import { exigirPerfil, PERFIS } from '../middlewares/autenticacao.js'
import * as servico from '../servicos/versoes.js'
import { despublicarVersao, publicarVersao } from '../servicos/publicacao.js'
import * as exportacao from '../servicos/exportacao.js'

const rotas = Router({ mergeParams: true })
rotas.use(exigirPerfil(PERFIS.GESTOR))

const Periodo = z.object({ periodoId: z.coerce.number().int().positive() })
const Versao = Periodo.extend({ id: z.coerce.number().int().positive() })
const Nome = z.string().trim().min(1, 'Informe o nome').max(80, 'Use até 80 caracteres')

rotas.get('/', validar({ params: Periodo }), async (req, res) => {
  res.json(await servico.listarVersoes(req.params.periodoId))
})

// Novo horário: com as atribuições da oferta, ou cópia de outro horário (copiarDe).
rotas.post(
  '/',
  validar({
    params: Periodo,
    body: z.object({ nome: Nome, copiarDe: z.number().int().positive().nullable().optional() }),
  }),
  async (req, res) => {
    res.status(201).json(await servico.criarVersao(req.params.periodoId, req.body))
  }
)

rotas.get('/:id', validar({ params: Versao }), async (req, res) => {
  res.json(await servico.resumoVersao(req.params.periodoId, req.params.id))
})

rotas.get('/:id/aulas', validar({ params: Versao }), async (req, res) => {
  res.json(await servico.aulasDaVersao(req.params.periodoId, req.params.id))
})

rotas.get('/:id/avaliacao', validar({ params: Versao }), async (req, res) => {
  res.json(await servico.avaliarVersao(req.params.periodoId, req.params.id))
})

rotas.put('/:id', validar({ params: Versao, body: z.object({ nome: Nome }) }), async (req, res) => {
  res.json(await servico.renomearVersao(req.params.periodoId, req.params.id, req.body.nome))
})

rotas.post(
  '/:id/duplicar',
  validar({ params: Versao, body: z.object({ nome: Nome.optional() }) }),
  async (req, res) => {
    res
      .status(201)
      .json(await servico.duplicarVersao(req.params.periodoId, req.params.id, req.body.nome))
  }
)

rotas.post(
  '/:id/publicar',
  validar({ params: Versao, body: z.object({ forcar: z.boolean().default(false) }) }),
  async (req, res) => {
    res.json(await publicarVersao(req.params.periodoId, req.params.id, req.body))
  }
)

rotas.post('/:id/despublicar', validar({ params: Versao }), async (req, res) => {
  res.json(await despublicarVersao(req.params.periodoId, req.params.id))
})

rotas.get(
  '/:id/exportar/pdf',
  validar({
    params: Versao,
    query: z.object({
      tipo: z.enum(exportacao.TIPOS_PDF),
      recurso: z.coerce.number().int().positive().optional(),
    }),
  }),
  async (req, res) => {
    const dados = await exportacao.carregarGrade(req.params.periodoId, req.params.id)
    const { tipo, recurso } = req.validatedQuery
    const arquivo = await exportacao.gerarPdf(dados, { tipo, recursoId: recurso ?? null })
    exportacao.enviarArquivo(res, arquivo, exportacao.PDF)
  }
)

rotas.get('/:id/exportar/xlsx', validar({ params: Versao }), async (req, res) => {
  const dados = await exportacao.carregarGrade(req.params.periodoId, req.params.id)
  exportacao.enviarArquivo(res, await exportacao.gerarXlsx(dados), exportacao.XLSX)
})

rotas.delete('/:id', validar({ params: Versao }), async (req, res) => {
  await servico.excluirVersao(req.params.periodoId, req.params.id)
  res.status(204).end()
})

export default rotas
