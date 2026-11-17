// Horários (tabela versao_grade): cenários da grade de um período, com nome.
// Cada horário tem as próprias atribuições (atribuicao.versao_id), copiadas da
// oferta do período ou de outro horário ao ser criado. O solver preenche um
// horário existente; o editor e a avaliação trabalham sobre ele.
// F3-05, F3-08 e F3-10: gravação do resultado do solver, aulas, avaliação,
// renomear, duplicar e excluir.

import { db } from '../db/knex.js'
import { avaliarGrade } from '../core/index.js'
import { corDoProfessor } from '../core/cores.js'
import { ErroConflito, ErroNaoEncontrado } from '../erros.js'
import { montarProblema } from './problema.js'

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : (v ?? null))
const LOTE = 500

function paraVersao(v) {
  return {
    id: v.id,
    nome: v.nome,
    origem: v.origem,
    semente: v.semente,
    pontuacao: v.pontuacao == null ? null : Number(v.pontuacao),
    custoRigido: v.custo_rigido,
    valida: v.custo_rigido == null ? null : v.custo_rigido === 0,
    pontuacaoPorRestricao: json(v.pontuacao_por_restricao),
    detalhes: json(v.detalhes),
    publicada: !!v.publicada,
    publicadaEm: v.publicada_em ?? null,
    criadaEm: v.created_at,
    atualizadaEm: v.updated_at,
    totalAulas: v.total_aulas == null ? undefined : Number(v.total_aulas),
    aulasFixadas: v.aulas_fixadas == null ? undefined : Number(v.aulas_fixadas),
    aulasRevisar: v.aulas_revisar == null ? undefined : Number(v.aulas_revisar),
    totalAtribuicoes: v.total_atribuicoes == null ? undefined : Number(v.total_atribuicoes),
    aulasPrevistas: v.aulas_previstas == null ? undefined : Number(v.aulas_previstas),
  }
}

function consultaVersoes(periodoId) {
  return db('versao_grade as v')
    .where('v.periodo_id', periodoId)
    .select(
      'v.*',
      db('aula').count('*').where('versao_id', db.ref('v.id')).as('total_aulas'),
      db('aula')
        .count('*')
        .where({ versao_id: db.ref('v.id'), fixada: true })
        .as('aulas_fixadas'),
      db('aula')
        .count('*')
        .where({ versao_id: db.ref('v.id'), revisar: true })
        .as('aulas_revisar'),
      db('atribuicao').count('*').where('versao_id', db.ref('v.id')).as('total_atribuicoes'),
      db('atribuicao')
        .sum('aulas_semanais')
        .where('versao_id', db.ref('v.id'))
        .as('aulas_previstas')
    )
}

async function buscarVersao(periodoId, id, trx = db) {
  const v = await trx('versao_grade').where({ id, periodo_id: periodoId }).first()
  if (!v) throw new ErroNaoEncontrado('Horário não encontrado neste período')
  return v
}

export async function listarVersoes(periodoId) {
  const linhas = await consultaVersoes(periodoId).orderBy('v.id', 'desc')
  return linhas.map(paraVersao)
}

export async function resumoVersao(periodoId, id) {
  const linha = await consultaVersoes(periodoId).where('v.id', id).first()
  if (!linha) throw new ErroNaoEncontrado('Horário não encontrado neste período')
  return paraVersao(linha)
}

async function inserirAulas(trx, versaoId, aulas) {
  for (let i = 0; i < aulas.length; i += LOTE) {
    await trx('aula').insert(aulas.slice(i, i + LOTE).map((a) => ({ ...a, versao_id: versaoId })))
  }
}

// Copia as atribuições (com os professores) da oferta do período (origem null) ou
// de outro horário para o horário de destino. Devolve o mapa id antigo → id novo.
// somenteIds: copia só estas atribuições da origem.
export async function copiarAtribuicoes(
  trx,
  periodoId,
  destinoId,
  origemId = null,
  somenteIds = null
) {
  const origem = await trx('atribuicao')
    .where({ periodo_id: periodoId })
    .modify((q) => (origemId ? q.where('versao_id', origemId) : q.whereNull('versao_id')))
    .modify((q) => (somenteIds ? q.whereIn('id', somenteIds) : q))
    .orderBy('id')
  const mapa = new Map()
  for (const a of origem) {
    const [novo] = await trx('atribuicao').insert({
      periodo_id: periodoId,
      versao_id: destinoId,
      turma_id: a.turma_id,
      disciplina_id: a.disciplina_id,
      aulas_semanais: a.aulas_semanais,
      tamanho_bloco: a.tamanho_bloco,
      grupo_paralelo: a.grupo_paralelo,
    })
    mapa.set(a.id, novo)
  }
  if (mapa.size) {
    const vinculos = await trx('atribuicao_professor').whereIn('atribuicao_id', [...mapa.keys()])
    if (vinculos.length) {
      await trx('atribuicao_professor').insert(
        vinculos.map((v) => ({
          atribuicao_id: mapa.get(v.atribuicao_id),
          professor_id: v.professor_id,
        }))
      )
    }
  }
  return mapa
}

// Copia a disponibilidade (indisponibilidades e preferências) do padrão do período
// (origem null) ou de outro horário para o horário de destino.
export async function copiarDisponibilidade(trx, periodoId, destinoId, origemId = null) {
  const origem = await trx('indisponibilidade')
    .where({ periodo_id: periodoId })
    .modify((q) => (origemId ? q.where('versao_id', origemId) : q.whereNull('versao_id')))
  if (!origem.length) return 0
  await trx('indisponibilidade').insert(
    origem.map((i) => ({
      periodo_id: periodoId,
      versao_id: destinoId,
      tipo_recurso: i.tipo_recurso,
      recurso_id: i.recurso_id,
      horario_id: i.horario_id,
      rigida: i.rigida,
      motivo: i.motivo,
    }))
  )
  return origem.length
}

// Cria um horário com nome. Sem copiarDe, começa sem aulas, com as atribuições da
// oferta e a disponibilidade padrão do período; com copiarDe, é uma cópia daquele
// horário (atribuições, disponibilidade e aulas).
export async function criarVersao(periodoId, { nome, copiarDe = null }) {
  if (copiarDe) return duplicarVersao(periodoId, copiarDe, nome)
  const periodo = await db('periodo_letivo').where({ id: periodoId }).first('id')
  if (!periodo) throw new ErroNaoEncontrado('Período letivo não encontrado')
  const id = await db.transaction(async (trx) => {
    const [versaoId] = await trx('versao_grade').insert({
      periodo_id: periodoId,
      nome,
      origem: 'manual',
      detalhes: JSON.stringify({ criadoDe: 'oferta' }),
    })
    await copiarAtribuicoes(trx, periodoId, versaoId)
    await copiarDisponibilidade(trx, periodoId, versaoId)
    return versaoId
  })
  return resumoVersao(periodoId, id)
}

// Grava a solução do solver no horário: as aulas fixadas ficam, as demais são
// substituídas. O banco não aceita duas aulas na mesma sala e horário; se a
// solução tiver esse choque, a aula excedente fica sem sala (a R7 aponta).
export async function gravarSolucao(periodoId, versaoId, solucao, { detalhes = {} } = {}) {
  await db.transaction(async (trx) => {
    const versao = await buscarVersao(periodoId, versaoId, trx)
    if (versao.publicada) throw new ErroConflito('O horário publicado não pode ser regerado')
    await trx('aula').where({ versao_id: versaoId, fixada: false }).delete()
    const fixadas = await trx('aula').where({ versao_id: versaoId }).select('horario_id', 'sala_id')
    const ocupadas = new Set(
      fixadas.filter((a) => a.sala_id != null).map((a) => `${a.horario_id}|${a.sala_id}`)
    )
    let semSala = 0
    const aulas = solucao.aulas
      .filter((a) => !a.fixada)
      .map((a) => {
        let salaId = a.salaId ?? null
        if (salaId != null) {
          const chave = `${a.horarioId}|${salaId}`
          if (ocupadas.has(chave)) {
            salaId = null
            semSala++
          } else ocupadas.add(chave)
        }
        return {
          atribuicao_id: a.atribuicaoId,
          horario_id: a.horarioId,
          sala_id: salaId,
          fixada: false,
        }
      })
    await inserirAulas(trx, versaoId, aulas)
    await trx('versao_grade')
      .where({ id: versaoId })
      .update({
        origem: 'solver',
        semente: solucao.semente,
        pontuacao: solucao.pontuacao,
        custo_rigido: solucao.custoRigido,
        pontuacao_por_restricao: JSON.stringify(solucao.pontuacaoPorRestricao),
        detalhes: JSON.stringify({
          ...(json(versao.detalhes) ?? {}),
          iteracoes: solucao.iteracoes,
          tempoMs: solucao.tempoMs,
          motivoFim: solucao.motivoFim,
          naoAlocados: solucao.naoAlocados,
          aulasSemSalaAoGravar: semSala,
          geradoEm: new Date(),
          ...detalhes,
        }),
        updated_at: trx.fn.now(),
      })
  })
  return resumoVersao(periodoId, versaoId)
}

// Aulas da versão com os nomes necessários para desenhar a grade.
// ids: só estas aulas (resposta das edições).
export async function aulasDaVersao(periodoId, id, ids = null) {
  await buscarVersao(periodoId, id)
  const aulas = await db('aula as au')
    .join('atribuicao as a', 'a.id', 'au.atribuicao_id')
    .join('turma as t', 't.id', 'a.turma_id')
    .join('disciplina as d', 'd.id', 'a.disciplina_id')
    .leftJoin('sala as s', 's.id', 'au.sala_id')
    .where('au.versao_id', id)
    .modify((q) => (ids ? q.whereIn('au.id', ids) : q))
    .select(
      'au.id',
      'au.atribuicao_id',
      'au.horario_id',
      'au.sala_id',
      'au.fixada',
      'au.revisar',
      'a.turma_id',
      'a.grupo_paralelo',
      't.codigo as turma',
      'd.sigla',
      'd.nome as disciplina',
      's.nome as sala'
    )
    .orderBy('au.id')
  const professores = await db('atribuicao_professor as ap')
    .join('professor as p', 'p.id', 'ap.professor_id')
    .whereIn('ap.atribuicao_id', db('aula').where({ versao_id: id }).distinct('atribuicao_id'))
    .select('ap.atribuicao_id', 'p.id', 'p.nome', 'p.cor')
    .orderBy('p.nome')
  const porAtribuicao = new Map()
  for (const p of professores) {
    if (!porAtribuicao.has(p.atribuicao_id)) porAtribuicao.set(p.atribuicao_id, [])
    porAtribuicao
      .get(p.atribuicao_id)
      .push({ id: p.id, nome: p.nome, cor: corDoProfessor(p.id, p.cor) })
  }
  return aulas.map((a) => ({
    id: a.id,
    atribuicaoId: a.atribuicao_id,
    horarioId: a.horario_id,
    salaId: a.sala_id,
    sala: a.sala,
    fixada: !!a.fixada,
    revisar: !!a.revisar,
    turmaId: a.turma_id,
    turma: a.turma,
    grupoParalelo: a.grupo_paralelo,
    sigla: a.sigla,
    disciplina: a.disciplina,
    professores: porAtribuicao.get(a.atribuicao_id) ?? [],
  }))
}

// F3-08 — Avalia a versão com as regras e pesos atuais do período. As violações
// apontam aulas pelo id no banco.
export async function avaliarVersao(periodoId, id) {
  await buscarVersao(periodoId, id)
  const { problema } = await montarProblema(periodoId, {
    versaoId: id,
    incluirInativos: true,
    incluirFixadas: false,
  })
  const atribuicoes = new Set(problema.atribuicoes.map((a) => a.id))
  const linhas = await db('aula').where({ versao_id: id }).orderBy('id')
  const avisos = []
  const consideradas = linhas.filter((a) => {
    if (atribuicoes.has(a.atribuicao_id)) return true
    avisos.push(`Aula ${a.id} ignorada: a atribuição ${a.atribuicao_id} não tem professor`)
    return false
  })
  const resultado = avaliarGrade(
    problema,
    consideradas.map((a) => ({
      atribuicaoId: a.atribuicao_id,
      horarioId: a.horario_id,
      salaId: a.sala_id,
      fixada: !!a.fixada,
    }))
  )
  return {
    ...resultado,
    violacoes: resultado.violacoes.map((v) => ({
      ...v,
      aulas: v.aulas.map((k) => consideradas[k].id),
    })),
    avisos,
  }
}

export async function renomearVersao(periodoId, id, nome) {
  await buscarVersao(periodoId, id)
  await db('versao_grade').where({ id }).update({ nome, updated_at: db.fn.now() })
  return resumoVersao(periodoId, id)
}

export async function duplicarVersao(periodoId, id, nome) {
  const original = await buscarVersao(periodoId, id)
  const novoId = await db.transaction(async (trx) => {
    const [versaoId] = await trx('versao_grade').insert({
      periodo_id: periodoId,
      nome: nome ?? `${original.nome} (cópia)`.slice(0, 80),
      origem: 'manual',
      semente: original.semente,
      pontuacao: original.pontuacao,
      custo_rigido: original.custo_rigido,
      pontuacao_por_restricao: original.pontuacao_por_restricao,
      detalhes: JSON.stringify({ ...(json(original.detalhes) ?? {}), copiaDe: original.id }),
    })
    // As aulas da cópia apontam para as atribuições copiadas.
    const mapa = await copiarAtribuicoes(trx, periodoId, versaoId, id)
    await copiarDisponibilidade(trx, periodoId, versaoId, id)
    const aulas = await trx('aula')
      .where({ versao_id: id })
      .select('atribuicao_id', 'horario_id', 'sala_id', 'fixada', 'revisar')
    await inserirAulas(
      trx,
      versaoId,
      aulas.map((a) => ({ ...a, atribuicao_id: mapa.get(a.atribuicao_id) }))
    )
    return versaoId
  })
  return resumoVersao(periodoId, novoId)
}

export async function excluirVersao(periodoId, id) {
  const v = await buscarVersao(periodoId, id)
  if (v.publicada) throw new ErroConflito('O horário publicado não pode ser excluído')
  await db('versao_grade').where({ id }).delete()
}
