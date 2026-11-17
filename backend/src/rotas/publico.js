// F5-06 — Consulta pública, sem login, da grade publicada de cada período.
//   GET /api/publico/periodos                         períodos com versão publicada
//   GET /api/publico/periodos/:id                     grade horária, recursos e aulas
//   GET /api/publico/periodos/:id/pdf?tipo=&recurso=  PDF de uma turma, professor ou sala
// Só expõe o que já está no mural: siglas, nomes, turmas, salas e horários. Nada
// de e-mail, SIAPE, carga ou indisponibilidade.
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/knex.js'
import { validar } from '../middlewares/validar.js'
import { ErroNaoEncontrado } from '../erros.js'
import * as exportacao from '../servicos/exportacao.js'

const rotas = Router()
const Periodo = z.object({ id: z.coerce.number().int().positive() })

async function versaoPublicada(periodoId) {
  const versao = await db('versao_grade').where({ periodo_id: periodoId, publicada: true }).first()
  if (!versao) throw new ErroNaoEncontrado('Este período não tem grade publicada')
  return versao
}

rotas.get('/periodos', async (_req, res) => {
  const linhas = await db('versao_grade as v')
    .join('periodo_letivo as p', 'p.id', 'v.periodo_id')
    .where('v.publicada', true)
    .select('p.id', 'p.nome', 'v.nome as versao', 'v.publicada_em')
    .orderBy('p.nome', 'desc')
  res.json(
    linhas.map((l) => ({ id: l.id, nome: l.nome, versao: l.versao, publicadaEm: l.publicada_em }))
  )
})

rotas.get('/periodos/:id', validar({ params: Periodo }), async (req, res) => {
  const versao = await versaoPublicada(req.params.id)
  const dados = await exportacao.carregarGrade(req.params.id, versao.id)
  res.set('Cache-Control', 'public, max-age=60')
  res.json({
    periodo: dados.periodo,
    versao: { nome: dados.versao.nome, publicadaEm: dados.versao.publicadaEm },
    gradeHoraria: dados.gradeHoraria,
    recursos: dados.recursos,
    aulas: dados.aulas.map((a) => ({
      id: a.id,
      horarioId: a.horarioId,
      turmaId: a.turmaId,
      turma: a.turma,
      salaId: a.salaId,
      sala: a.sala,
      sigla: a.sigla,
      disciplina: a.disciplina,
      grupoParalelo: a.grupoParalelo,
      atribuicaoId: a.atribuicaoId,
      professores: a.professores.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor })),
      fixada: false,
      revisar: false,
    })),
  })
})

rotas.get(
  '/periodos/:id/pdf',
  validar({
    params: Periodo,
    query: z.object({
      tipo: z.enum(['turma', 'professor', 'sala']),
      recurso: z.coerce.number().int().positive(),
    }),
  }),
  async (req, res) => {
    const versao = await versaoPublicada(req.params.id)
    const dados = await exportacao.carregarGrade(req.params.id, versao.id)
    const { tipo, recurso } = req.validatedQuery
    const arquivo = await exportacao.gerarPdf(dados, { tipo, recursoId: recurso })
    exportacao.enviarArquivo(res, arquivo, exportacao.PDF)
  }
)

export default rotas
