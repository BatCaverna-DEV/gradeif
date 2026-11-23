// F5-07 e F5-08 — Indisponibilidades e preferências por recurso.
// rigida = true: não pode (R6). rigida = false: prefere evitar (F5, só professor).
// Gravar substitui todas as marcações do recurso no escopo.
//
// Escopo (versaoId):
//   um horário → a disponibilidade daquele horário; cada horário tem a sua, porque
//                pode mudar de uma proposta para outra (o gestor ajusta);
//   null       → o padrão do período: o que os professores informam pela conta
//                deles. É copiado para cada horário novo.

import { db } from '../db/knex.js'
import { ErroConflito, ErroNaoEncontrado, ErroProibido, ErroValidacao } from '../erros.js'

export const TIPOS = ['professor', 'turma', 'sala']

const doEscopo =
  (versaoId, coluna = 'versao_id') =>
  (q) =>
    versaoId ? q.where(coluna, versaoId) : q.whereNull(coluna)

async function nomeDoRecurso(periodoId, tipo, id) {
  if (tipo === 'professor') {
    const p = await db('professor').where({ id }).first()
    return p?.nome
  }
  if (tipo === 'turma') {
    const t = await db('turma').where({ id, periodo_id: periodoId }).first()
    return t?.codigo
  }
  const s = await db('sala').where({ id }).first()
  return s?.nome
}

async function exigirHorario(periodoId, versaoId, { paraEditar = false } = {}) {
  if (!versaoId) return null
  const versao = await db('versao_grade').where({ id: versaoId, periodo_id: periodoId }).first()
  if (!versao) throw new ErroNaoEncontrado('Horário não encontrado neste período')
  if (paraEditar && versao.publicada) {
    throw new ErroConflito(
      'O horário publicado não pode ser alterado; duplique-o para fazer ajustes'
    )
  }
  return versao
}

// Professor só vê e altera a própria disponibilidade, e só a do padrão do período
// (a de cada horário é ajustada pelo gestor).
export function verificarAcesso(usuario, tipo, recursoId, versaoId = null) {
  if (usuario.perfil === 'gestor') return
  if (versaoId) throw new ErroProibido('A disponibilidade de cada horário é ajustada pelo gestor')
  if (tipo !== 'professor' || !usuario.professorId || usuario.professorId !== recursoId) {
    throw new ErroProibido('Você só pode alterar a sua própria disponibilidade')
  }
}

export async function obterDisponibilidade(periodoId, tipo, recursoId, versaoId = null) {
  await exigirHorario(periodoId, versaoId)
  const nome = await nomeDoRecurso(periodoId, tipo, recursoId)
  if (!nome) throw new ErroNaoEncontrado('Recurso não encontrado')
  const itens = await db('indisponibilidade')
    .where({ periodo_id: periodoId, tipo_recurso: tipo, recurso_id: recursoId })
    .modify(doEscopo(versaoId))
    .select('horario_id', 'rigida', 'motivo')
  return {
    recurso: { tipo, id: recursoId, nome },
    versaoId,
    itens: itens.map((i) => ({ horarioId: i.horario_id, rigida: !!i.rigida, motivo: i.motivo })),
  }
}

export async function definirDisponibilidade(periodoId, tipo, recursoId, itens, versaoId = null) {
  await exigirHorario(periodoId, versaoId, { paraEditar: true })
  const nome = await nomeDoRecurso(periodoId, tipo, recursoId)
  if (!nome) throw new ErroNaoEncontrado('Recurso não encontrado')
  if (tipo !== 'professor' && itens.some((i) => !i.rigida)) {
    throw new ErroValidacao([], 'Preferência (prefere evitar) só vale para professor')
  }
  const ids = [...new Set(itens.map((i) => i.horarioId))]
  if (ids.length !== itens.length) throw new ErroValidacao([], 'Horário repetido na lista')
  if (ids.length) {
    const doPeriodo = await db('horario')
      .where({ periodo_id: periodoId })
      .whereIn('id', ids)
      .pluck('id')
    if (doPeriodo.length !== ids.length) {
      throw new ErroValidacao([], 'Há horário que não pertence ao período')
    }
  }
  await db.transaction(async (trx) => {
    await trx('indisponibilidade')
      .where({ periodo_id: periodoId, tipo_recurso: tipo, recurso_id: recursoId })
      .modify(doEscopo(versaoId))
      .delete()
    if (itens.length) {
      await trx('indisponibilidade').insert(
        itens.map((i) => ({
          periodo_id: periodoId,
          versao_id: versaoId,
          tipo_recurso: tipo,
          recurso_id: recursoId,
          horario_id: i.horarioId,
          rigida: i.rigida,
          motivo: i.motivo?.trim() || null,
        }))
      )
    }
  })
  return obterDisponibilidade(periodoId, tipo, recursoId, versaoId)
}

// Tempos em que cada turma não pode ter aula no escopo (só marcações rígidas; turma
// não tem "prefere evitar"). O editor e a visualização da grade usam isso para
// mostrar os turnos da turma e bloquear os tempos fechados.
export async function indisponiveisDasTurmas(periodoId, versaoId = null) {
  await exigirHorario(periodoId, versaoId)
  const linhas = await db('indisponibilidade')
    .where({ periodo_id: periodoId, tipo_recurso: 'turma', rigida: true })
    .modify(doEscopo(versaoId))
    .orderBy(['recurso_id', 'horario_id'])
    .select('recurso_id', 'horario_id')
  const porTurma = new Map()
  for (const l of linhas) {
    if (!porTurma.has(l.recurso_id)) porTurma.set(l.recurso_id, [])
    porTurma.get(l.recurso_id).push(l.horario_id)
  }
  return {
    versaoId,
    turmas: [...porTurma].map(([turmaId, horarios]) => ({ turmaId, horarios })),
  }
}

// Copia a disponibilidade de um recurso do padrão do período para o horário,
// substituindo a do horário (botão "usar o padrão" na tela).
export async function copiarDoPadrao(periodoId, tipo, recursoId, versaoId) {
  const padrao = await obterDisponibilidade(periodoId, tipo, recursoId, null)
  return definirDisponibilidade(periodoId, tipo, recursoId, padrao.itens, versaoId)
}

// Professores do período (com atribuição) e quantas marcações cada um tem no escopo.
export async function resumoProfessores(periodoId, usuario, versaoId = null) {
  await exigirHorario(periodoId, versaoId)
  const contagem = (rigida) =>
    db('indisponibilidade')
      .count('*')
      .where({ periodo_id: periodoId, tipo_recurso: 'professor', rigida })
      .modify(doEscopo(versaoId))
      .where('recurso_id', db.ref('p.id'))
  const consulta = db('professor as p')
    .whereIn(
      'p.id',
      db('atribuicao_professor as ap')
        .join('atribuicao as a', 'a.id', 'ap.atribuicao_id')
        .where('a.periodo_id', periodoId)
        .modify(doEscopo(versaoId, 'a.versao_id'))
        .select('ap.professor_id')
    )
    .select(
      'p.id',
      'p.nome',
      'p.ativo',
      contagem(true).as('indisponiveis'),
      contagem(false).as('preferencias'),
      db('usuario').count('*').where('professor_id', db.ref('p.id')).as('contas')
    )
    .orderBy('p.nome')
  if (usuario.perfil !== 'gestor') consulta.where('p.id', usuario.professorId ?? 0)
  return (await consulta).map((p) => ({
    id: p.id,
    nome: p.nome,
    ativo: !!p.ativo,
    indisponiveis: Number(p.indisponiveis),
    preferencias: Number(p.preferencias),
    temConta: Number(p.contas) > 0,
  }))
}
