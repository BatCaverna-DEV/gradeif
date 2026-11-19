// Fase 4 — Editor manual de uma versão.
//
// F4-01: simular() diz, para uma aula (ou uma aula nova de uma atribuição), o que
// acontece em cada horário: livre, viola flexível ou viola rígida, com os motivos.
// Usa os mesmos módulos de restrição do solver, em modo incremental.
// F4-02 e seguintes: operações sobre as aulas (posicionar, trocar, criar, remover,
// fixar, marcar como revisada). Toda operação devolve as aulas alteradas, a nova
// avaliação e as aulas que faltam alocar, e atualiza a pontuação guardada na versão.

import { db } from '../db/knex.js'
import { Avaliador } from '../core/avaliador.js'
import { criarInstancia, INDISPONIVEL, PREFERE_EVITAR } from '../core/instancia.js'
import { montarGrade } from '../core/index.js'
import { corDoProfessor } from '../core/cores.js'
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from '../erros.js'
import { montarProblema } from './problema.js'
import { aulasDaVersao } from './versoes.js'

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : (v ?? null))
const MAXIMO_MOTIVOS = 4

async function buscarVersao(periodoId, versaoId, { paraEditar = false } = {}) {
  const v = await db('versao_grade').where({ id: versaoId, periodo_id: periodoId }).first()
  if (!v) throw new ErroNaoEncontrado('Versão da grade não encontrada neste período')
  if (paraEditar && v.publicada) {
    throw new ErroConflito('A versão publicada não pode ser editada; duplique-a para fazer ajustes')
  }
  return v
}

// Problema do período + grade da versão, avaliada por completo.
async function contexto(periodoId, versaoId) {
  const { problema } = await montarProblema(periodoId, {
    versaoId,
    incluirInativos: true,
    incluirFixadas: false,
  })
  const inst = criarInstancia(problema)
  const linhas = (await db('aula').where({ versao_id: versaoId }).orderBy('id')).filter((a) =>
    inst.idx.atribuicao.has(a.atribuicao_id)
  )
  const grade = montarGrade(
    inst,
    linhas.map((a) => ({
      atribuicaoId: a.atribuicao_id,
      horarioId: a.horario_id,
      salaId: a.sala_id,
      fixada: !!a.fixada,
    }))
  )
  const av = new Avaliador(grade)
  av.avaliarTudo()
  const indiceDaAula = new Map(linhas.map((a, i) => [a.id, i]))
  return { problema, inst, grade, av, linhas, indiceDaAula }
}

// Avaliação com as violações apontando ids de aula.
function avaliacaoDoContexto(ctx) {
  const r = ctx.av.relatorio()
  return {
    ...r,
    violacoes: r.violacoes.map((v) => ({ ...v, aulas: v.aulas.map((k) => ctx.linhas[k].id) })),
  }
}

// Aulas que faltam alocar, por atribuição (lista lateral do editor).
async function faltantes(periodoId, versaoId) {
  const atribuicoes = await db('atribuicao as a')
    .join('turma as t', 't.id', 'a.turma_id')
    .join('disciplina as d', 'd.id', 'a.disciplina_id')
    .where('a.periodo_id', periodoId)
    .where('a.versao_id', versaoId)
    .select(
      'a.id',
      'a.turma_id',
      'a.aulas_semanais',
      'a.tamanho_bloco',
      't.codigo as turma',
      'd.sigla',
      'd.nome as disciplina',
      db('aula')
        .count('*')
        .where({ versao_id: versaoId, atribuicao_id: db.ref('a.id') })
        .as('alocadas')
    )
    .orderBy(['t.codigo', 'd.sigla'])
  const pendentes = atribuicoes.filter((a) => a.aulas_semanais > Number(a.alocadas))
  if (!pendentes.length) return []
  const professores = await db('atribuicao_professor as ap')
    .join('professor as p', 'p.id', 'ap.professor_id')
    .whereIn(
      'ap.atribuicao_id',
      pendentes.map((a) => a.id)
    )
    .select('ap.atribuicao_id', 'p.id', 'p.nome', 'p.cor')
    .orderBy('p.nome')
  return pendentes.map((a) => ({
    atribuicaoId: a.id,
    turmaId: a.turma_id,
    turma: a.turma,
    sigla: a.sigla,
    disciplina: a.disciplina,
    professores: professores
      .filter((p) => p.atribuicao_id === a.id)
      .map((p) => ({ id: p.id, nome: p.nome, cor: corDoProfessor(p.id, p.cor) })),
    tamanhoBloco: a.tamanho_bloco,
    faltam: a.aulas_semanais - Number(a.alocadas),
  }))
}

export async function estadoDoEditor(periodoId, versaoId) {
  await buscarVersao(periodoId, versaoId)
  const ctx = await contexto(periodoId, versaoId)
  return {
    aulas: await aulasDaVersao(periodoId, versaoId),
    avaliacao: avaliacaoDoContexto(ctx),
    faltantes: await faltantes(periodoId, versaoId),
  }
}

// ---------- F4-01: simulação ----------

// Sala para a aula i no horário h: a atual, se estiver livre e servir; senão a
// primeira compatível livre; sem nenhuma livre, fica sem sala (a R7 aponta).
function salaPara(ctx, i, h) {
  const { inst, grade: g } = ctx
  if (inst.S === 0) return -1
  const livre = (s) =>
    !g.aulasDaSala(s, h).some((j) => j !== i) && inst.indisp.sala[s * inst.H + h] !== INDISPONIVEL
  const compativeis = inst.atrSalas[g.atr[i]]
  const atual = g.sala[i]
  if (atual >= 0 && compativeis.includes(atual) && livre(atual)) return atual
  return compativeis.find(livre) ?? -1
}

// Motivos de uma piora: violações das unidades que pioraram, preferindo as que
// envolvem a própria aula, com as rígidas na frente.
function explicar(ctx, i, pioras) {
  const motivos = []
  // Rígidas primeiro: são elas que pedem confirmação.
  const ordenadas = [...pioras].sort((x, y) => Number(y.m.rigida) - Number(x.m.rigida))
  for (const { m, r } of ordenadas) {
    const todas = m.modulo.violacoes(ctx.grade, r, m.cfg)
    const daAula = todas.filter((v) => v.aulas.includes(i))
    for (const v of daAula.length ? daAula : todas) motivos.push(`${v.codigo}: ${v.mensagem}`)
    if (motivos.length >= MAXIMO_MOTIVOS) break
  }
  return [...new Set(motivos)].slice(0, MAXIMO_MOTIVOS)
}

// Situação dos professores da aula i no horário h, sem contar a própria aula:
// 'indisponivel' (indisponibilidade rígida), 'ocupado' (outra aula), 'evitar'
// (prefere evitar) ou 'livre'. Com mais de um professor, vale a pior.
const ORDEM_PROFESSOR = ['livre', 'evitar', 'ocupado', 'indisponivel']
function situacaoProfessor(ctx, i, h) {
  const { inst, grade: g } = ctx
  let pior = 0
  for (const p of inst.atrProfs[g.atr[i]]) {
    const indisp = inst.indisp.professor[p * inst.H + h]
    if (indisp === INDISPONIVEL) return 'indisponivel'
    if (g.aulasDoProfessor(p, h).some((j) => j !== i)) pior = Math.max(pior, 2)
    else if (indisp === PREFERE_EVITAR) pior = Math.max(pior, 1)
  }
  return ORDEM_PROFESSOR[pior]
}

export async function simular(periodoId, versaoId, { aulaId, atribuicaoId }) {
  await buscarVersao(periodoId, versaoId)
  const ctx = await contexto(periodoId, versaoId)
  const { inst, grade: g, av } = ctx
  let i
  if (aulaId != null) {
    i = ctx.indiceDaAula.get(aulaId)
    if (i === undefined) throw new ErroNaoEncontrado('Aula não encontrada nesta versão')
  } else {
    const a = inst.idx.atribuicao.get(atribuicaoId)
    if (a === undefined) throw new ErroNaoEncontrado('Atribuição não encontrada neste período')
    i = g.adicionar(a) // aula nova, ainda fora da grade: não altera nenhum custo
  }
  const hAtual = g.hor[i]
  const sAtual = g.sala[i]
  const idSala = (s) => (s >= 0 ? inst.problema.salas[s].id : null)

  const celulas = []
  for (let h = 0; h < inst.H; h++) {
    const horarioId = inst.horarios[h].id
    if (h === hAtual) {
      celulas.push({
        horarioId,
        nivel: 'atual',
        salaId: idSala(sAtual),
        professor: situacaoProfessor(ctx, i, h),
        motivos: [],
      })
      continue
    }
    const professor = situacaoProfessor(ctx, i, h)
    const s = salaPara(ctx, i, h)
    av.iniciarMudanca()
    av.tocarAula(i)
    g.mover(i, h, s)
    av.tocarAula(i)
    const variacao = av.calcularVariacao()
    // Piora por unidade e restrição (a variação líquida pode esconder uma piora).
    const pioras = []
    let pioraRigida = false
    const p = av.pendentes
    for (let k = 0; k < p.length; k += 3) {
      const m = p[k]
      if (p[k + 2] > m.cache[p[k + 1]]) {
        pioras.push({ m, r: p[k + 1] })
        if (m.rigida) pioraRigida = true
      }
    }
    const nivel = pioraRigida ? 'rigida' : variacao.flexivel > 0 ? 'flexivel' : 'livre'
    const motivos = nivel === 'livre' ? [] : explicar(ctx, i, pioras)
    av.descartar()
    g.mover(i, hAtual, sAtual)
    celulas.push({
      horarioId,
      nivel,
      salaId: idSala(s),
      professor,
      variacao: { rigido: variacao.rigido, flexivel: variacao.flexivel },
      motivos,
    })
  }
  return { aulaId: aulaId ?? null, atribuicaoId: inst.problema.atribuicoes[g.atr[i]].id, celulas }
}

// ---------- F4-02 e seguintes: alterações ----------

async function nomeHorario(trx, horarioId) {
  const h = await trx('horario as h')
    .join('turno as t', 't.id', 'h.turno_id')
    .where('h.id', horarioId)
    .select('h.dia_semana', 'h.ordem', 't.nome')
    .first()
  const dias = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
  return h ? `${dias[h.dia_semana]}, ${h.ordem}º tempo (${h.nome})` : `horário ${horarioId}`
}

// Executa a alteração numa transação e devolve o novo estado do editor.
async function editar(periodoId, versaoId, alteracao) {
  const versao = await buscarVersao(periodoId, versaoId, { paraEditar: true })
  const resultado = await db.transaction((trx) => alteracao(trx))
  const ctx = await contexto(periodoId, versaoId)
  const avaliacao = avaliacaoDoContexto(ctx)
  await db('versao_grade')
    .where({ id: versaoId })
    .update({
      pontuacao: avaliacao.pontuacao,
      custo_rigido: avaliacao.custoRigido,
      pontuacao_por_restricao: JSON.stringify(avaliacao.pontuacaoPorRestricao),
      detalhes: JSON.stringify({ ...(json(versao.detalhes) ?? {}), editadaEm: new Date() }),
      updated_at: db.fn.now(),
    })
  const alteradas = resultado.alteradas?.length
    ? await aulasDaVersao(periodoId, versaoId, resultado.alteradas)
    : []
  return {
    ...resultado,
    alteradas,
    removidas: resultado.removidas ?? [],
    avaliacao,
    faltantes: await faltantes(periodoId, versaoId),
  }
}

async function aulaDaVersao(trx, versaoId, aulaId) {
  const aula = await trx('aula').where({ id: aulaId, versao_id: versaoId }).first()
  if (!aula) throw new ErroNaoEncontrado(`Aula ${aulaId} não encontrada nesta versão`)
  return aula
}

async function validarDestino(trx, periodoId, { horarioId, salaId }) {
  const h = await trx('horario').where({ id: horarioId, periodo_id: periodoId }).first()
  if (!h) throw new ErroValidacao([], `Horário ${horarioId} não pertence ao período`)
  if (salaId != null && !(await trx('sala').where({ id: salaId }).first())) {
    throw new ErroValidacao([], `Sala ${salaId} não existe`)
  }
}

// Aplica posições a várias aulas de uma vez (mover, trocar, desfazer). Primeiro
// tira a sala de todas, para o índice único não acusar um choque passageiro.
async function aplicarPosicoes(trx, periodoId, versaoId, movimentos) {
  const ids = movimentos.map((m) => m.aulaId)
  if (new Set(ids).size !== ids.length) throw new ErroValidacao([], 'Aula repetida na alteração')
  const antes = []
  for (const m of movimentos) {
    const aula = await aulaDaVersao(trx, versaoId, m.aulaId)
    await validarDestino(trx, periodoId, m)
    antes.push({
      aulaId: aula.id,
      horarioId: aula.horario_id,
      salaId: aula.sala_id,
      revisar: !!aula.revisar,
    })
  }
  // Choque de sala com aula que não está sendo movida: o banco não aceita.
  const ocupadas = new Set()
  for (const m of movimentos) {
    if (m.salaId == null) continue
    const chave = `${m.horarioId}|${m.salaId}`
    const outra = await trx('aula')
      .where({ versao_id: versaoId, horario_id: m.horarioId, sala_id: m.salaId })
      .whereNotIn('id', ids)
      .first()
    if (outra || ocupadas.has(chave)) {
      const sala = await trx('sala').where({ id: m.salaId }).first()
      throw new ErroConflito(
        `A sala ${sala.nome} já tem aula em ${await nomeHorario(trx, m.horarioId)}; escolha outra sala ou deixe a aula sem sala`
      )
    }
    ocupadas.add(chave)
  }
  await trx('aula').whereIn('id', ids).update({ sala_id: null })
  for (const m of movimentos) {
    const anterior = antes.find((a) => a.aulaId === m.aulaId)
    const mudouHorario = anterior.horarioId !== m.horarioId
    await trx('aula')
      .where({ id: m.aulaId })
      .update({
        horario_id: m.horarioId,
        sala_id: m.salaId ?? null,
        // Mexer na aula resolve a marcação de revisão, salvo pedido explícito.
        revisar: m.revisar ?? (mudouHorario ? false : anterior.revisar),
      })
  }
  const depois = movimentos.map((m) => ({
    aulaId: m.aulaId,
    horarioId: m.horarioId,
    salaId: m.salaId ?? null,
  }))
  return { alteradas: ids, antes, depois }
}

export function posicionar(periodoId, versaoId, movimentos) {
  return editar(periodoId, versaoId, (trx) => aplicarPosicoes(trx, periodoId, versaoId, movimentos))
}

// Troca duas aulas de horário. Cada uma fica com a sua sala se ela estiver livre
// no novo horário; senão, fica com a sala da outra (que acabou de sair dali).
export function trocar(periodoId, versaoId, aulaA, aulaB) {
  if (aulaA === aulaB) throw new ErroValidacao([], 'Escolha duas aulas diferentes')
  return editar(periodoId, versaoId, async (trx) => {
    const a = await aulaDaVersao(trx, versaoId, aulaA)
    const b = await aulaDaVersao(trx, versaoId, aulaB)
    const livre = async (horarioId, salaId) =>
      salaId == null ||
      !(await trx('aula')
        .where({ versao_id: versaoId, horario_id: horarioId, sala_id: salaId })
        .whereNotIn('id', [a.id, b.id])
        .first())
    let salaA
    let salaB
    if (a.horario_id === b.horario_id) {
      // Mesmo horário: trocar é só trocar as salas.
      salaA = b.sala_id
      salaB = a.sala_id
    } else {
      salaA = (await livre(b.horario_id, a.sala_id)) ? a.sala_id : b.sala_id
      salaB = (await livre(a.horario_id, b.sala_id)) ? b.sala_id : a.sala_id
    }
    return aplicarPosicoes(trx, periodoId, versaoId, [
      { aulaId: a.id, horarioId: b.horario_id, salaId: salaA },
      { aulaId: b.id, horarioId: a.horario_id, salaId: salaB },
    ])
  })
}

// F4-07 — Alocar uma aula que estava faltando (ou recriar uma removida, no desfazer).
export function criarAula(periodoId, versaoId, dados) {
  return editar(periodoId, versaoId, async (trx) => {
    const atribuicao = await trx('atribuicao')
      .where({ id: dados.atribuicaoId, periodo_id: periodoId, versao_id: versaoId })
      .first()
    if (!atribuicao) throw new ErroNaoEncontrado('Atribuição não encontrada neste horário')
    await validarDestino(trx, periodoId, dados)
    if (dados.salaId != null) {
      const ocupada = await trx('aula')
        .where({ versao_id: versaoId, horario_id: dados.horarioId, sala_id: dados.salaId })
        .first()
      if (ocupada) {
        throw new ErroConflito(
          `A sala já tem aula em ${await nomeHorario(trx, dados.horarioId)}; escolha outra sala ou deixe a aula sem sala`
        )
      }
    }
    const [id] = await trx('aula').insert({
      versao_id: versaoId,
      atribuicao_id: dados.atribuicaoId,
      horario_id: dados.horarioId,
      sala_id: dados.salaId ?? null,
      fixada: !!dados.fixada,
      revisar: !!dados.revisar,
    })
    return { alteradas: [id], criada: id }
  })
}

// Tira a aula da grade (ela volta para a lista de não alocadas).
export function removerAula(periodoId, versaoId, aulaId) {
  return editar(periodoId, versaoId, async (trx) => {
    const aula = await aulaDaVersao(trx, versaoId, aulaId)
    await trx('aula').where({ id: aulaId }).delete()
    return {
      removidas: [aulaId],
      removida: {
        atribuicaoId: aula.atribuicao_id,
        horarioId: aula.horario_id,
        salaId: aula.sala_id,
        fixada: !!aula.fixada,
        revisar: !!aula.revisar,
      },
    }
  })
}

// F4-06 e F4-11 — Fixar/liberar e marcar como revisada.
export function marcarAula(periodoId, versaoId, aulaId, { fixada, revisar }) {
  return editar(periodoId, versaoId, async (trx) => {
    const aula = await aulaDaVersao(trx, versaoId, aulaId)
    const mudancas = {}
    if (fixada !== undefined) mudancas.fixada = fixada
    if (revisar !== undefined) mudancas.revisar = revisar
    if (Object.keys(mudancas).length) await trx('aula').where({ id: aula.id }).update(mudancas)
    return { alteradas: [aula.id] }
  })
}
