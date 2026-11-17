// F2-06 e F2-07 — Restrições flexíveis F1 a F10.
// O custo é em unidades sem peso; o avaliador multiplica pelo peso configurado.

import { PREFERE_EVITAR } from '../instancia.js'
import {
  aulasNoDia,
  contarJanelas,
  contarPorDia,
  criarViolacao,
  horariosDistintos,
  plural,
  porTurnoEDia,
} from './apoio.js'

const recurso = (inst, tipo, r) => ({ tipo, id: inst.idRecurso(tipo, r) })

// ======================= Da turma e da disciplina =======================

// F1: em cada dia, as aulas da atribuição formam sequências de tempos seguidos.
// Uma sequência de tamanho L comporta L div b blocos e deixa L mod b aulas soltas.
// Só a sobra natural (aulas mod b) pode ficar solta; o resto é custo.
function sequencias(g, a) {
  const { prox } = g.inst
  const hs = horariosDistintos(g, g.porAtribuicao[a])
  const seqs = []
  let atual = []
  for (const h of hs) {
    if (atual.length && prox[atual[atual.length - 1]] !== h) {
      seqs.push(atual)
      atual = []
    }
    atual.push(h)
  }
  if (atual.length) seqs.push(atual)
  return seqs
}

function avaliarF1(g, a) {
  const b = g.inst.atrBloco[a]
  if (b <= 1 || !g.porAtribuicao[a].length) return { custo: 0, soltas: [] }
  let sobras = 0
  const soltas = []
  for (const seq of sequencias(g, a)) {
    if (seq.length % b) {
      sobras += seq.length % b
      soltas.push(...seq)
    }
  }
  const custo = Math.max(0, sobras - (g.porAtribuicao[a].length % b))
  return { custo, soltas }
}

export const F1 = {
  codigo: 'F1',
  escopo: 'atribuicao',
  custo: (g, a) => avaliarF1(g, a).custo,
  violacoes(g, a) {
    const { inst } = g
    const { custo, soltas } = avaliarF1(g, a)
    if (!custo) return []
    const aulas = g.porAtribuicao[a].filter((i) => soltas.includes(g.hor[i]))
    return [
      criarViolacao({
        codigo: 'F1',
        custo,
        aulas,
        recurso: recurso(inst, 'atribuicao', a),
        mensagem: `${inst.rotuloAtribuicao(a)}: aulas geminadas (blocos de ${inst.atrBloco[a]}) separadas em ${soltas.map((h) => inst.rotuloHorario(h)).join('; ')}`,
      }),
    ]
  },
}

export const F2 = {
  codigo: 'F2',
  escopo: 'turma',
  custo: (g, t) => contarJanelas(g.inst, horariosDistintos(g, g.porTurma[t])),
  violacoes(g, t) {
    const { inst } = g
    const lista = []
    contarJanelas(inst, horariosDistintos(g, g.porTurma[t]), (primeiro, vagos) =>
      lista.push(
        criarViolacao({
          codigo: 'F2',
          custo: vagos,
          aulas: [],
          recurso: recurso(inst, 'turma', t),
          mensagem: `${inst.rotuloRecurso('turma', t)} tem ${plural(vagos, 'tempo vago', 'tempos vagos')} na ${inst.rotuloDia(inst.horDia[primeiro])} (${inst.turnos[inst.horTurno[primeiro]].nome})`,
        })
      )
    )
    return lista
  },
}

function excessoPorDia(inst, hs, maximo, fn) {
  let total = 0
  const porDia = contarPorDia(inst, hs)
  for (let d = 1; d <= 7; d++) {
    if (porDia[d] > maximo) {
      total += porDia[d] - maximo
      fn?.(d, porDia[d])
    }
  }
  return total
}

export const F4 = {
  codigo: 'F4',
  escopo: 'atribuicao',
  custo: (g, a, cfg) =>
    excessoPorDia(g.inst, horariosDistintos(g, g.porAtribuicao[a]), cfg.parametros.maximoPorDia),
  violacoes(g, a, cfg) {
    const { inst } = g
    const maximo = cfg.parametros.maximoPorDia
    const lista = []
    excessoPorDia(inst, horariosDistintos(g, g.porAtribuicao[a]), maximo, (d, n) =>
      lista.push(
        criarViolacao({
          codigo: 'F4',
          custo: n - maximo,
          aulas: aulasNoDia(g, g.porAtribuicao[a], d),
          recurso: recurso(inst, 'atribuicao', a),
          mensagem: `${inst.rotuloAtribuicao(a)}: ${n} aulas na ${inst.rotuloDia(d)} (limite de ${maximo})`,
        })
      )
    )
    return lista
  },
}

// F8: o ideal é um bloco por dia, até o número de dias da semana.
function avaliarF8(g, a) {
  const { inst } = g
  const n = g.porAtribuicao[a].length
  if (!n) return { custo: 0, dias: 0, ideal: 0 }
  const ideal = Math.min(Math.ceil(n / inst.atrBloco[a]), inst.dias.length)
  const porDia = contarPorDia(inst, horariosDistintos(g, g.porAtribuicao[a]))
  let dias = 0
  for (let d = 1; d <= 7; d++) if (porDia[d]) dias++
  return { custo: Math.max(0, ideal - dias), dias, ideal }
}

export const F8 = {
  codigo: 'F8',
  escopo: 'atribuicao',
  custo: (g, a) => avaliarF8(g, a).custo,
  violacoes(g, a) {
    const { inst } = g
    const { custo, dias, ideal } = avaliarF8(g, a)
    if (!custo) return []
    return [
      criarViolacao({
        codigo: 'F8',
        custo,
        aulas: [...g.porAtribuicao[a]],
        recurso: recurso(inst, 'atribuicao', a),
        mensagem: `${inst.rotuloAtribuicao(a)}: aulas em ${plural(dias, 'dia', 'dias')}, o ideal seria ${ideal}`,
      }),
    ]
  },
}

// F10: salas diferentes do mesmo tipo usadas pela turma no mesmo turno e dia.
// Ir ao laboratório ou à quadra não conta (é exigência da disciplina), mas trocar
// de uma sala comum para outra conta. Aulas de grupos paralelos ficam de fora,
// porque a turma dividida ocupa duas salas por natureza.
function trocasDeSala(g, t, fn) {
  const { inst } = g
  const aulas = g.porTurma[t].filter((i) => g.sala[i] >= 0 && inst.atrGrupo[g.atr[i]] < 0)
  aulas.sort((x, y) => g.hor[x] - g.hor[y])
  const hs = aulas.map((i) => g.hor[i])
  let total = 0
  porTurnoEDia(inst, hs, (primeiro, _ultimo, inicio, fim) => {
    const salas = new Set()
    const tipos = new Set()
    for (let k = inicio; k < fim; k++) {
      salas.add(g.sala[aulas[k]])
      tipos.add(inst.salaTipo[g.sala[aulas[k]]])
    }
    const trocas = salas.size - tipos.size
    if (trocas > 0) {
      total += trocas
      fn?.(primeiro, salas, aulas.slice(inicio, fim), trocas)
    }
  })
  return total
}

export const F10 = {
  codigo: 'F10',
  escopo: 'turma',
  custo: (g, t) => trocasDeSala(g, t),
  violacoes(g, t) {
    const { inst } = g
    const lista = []
    trocasDeSala(g, t, (primeiro, salas, aulas, trocas) =>
      lista.push(
        criarViolacao({
          codigo: 'F10',
          custo: trocas,
          aulas,
          recurso: recurso(inst, 'turma', t),
          mensagem: `${inst.rotuloRecurso('turma', t)} passa por ${salas.size} salas na ${inst.rotuloDia(inst.horDia[primeiro])} (${inst.turnos[inst.horTurno[primeiro]].nome}): ${[...salas].map((s) => inst.problema.salas[s].nome).join(', ')}`,
        })
      )
    )
    return lista
  },
}

// ============================ Do professor ============================

// F3: aula à noite no dia d e num dos primeiros tempos da manhã no dia d + 1.
function interjornadas(g, p, cfg) {
  const { inst } = g
  const turnos = inst.interjornada
  if (!turnos) return []
  const primeiros = cfg.parametros.primeirosTempos ?? 2
  const noite = new Uint8Array(9)
  const manha = new Uint8Array(9)
  for (const i of g.porProfessor[p]) {
    const h = g.hor[i]
    if (inst.horTurno[h] === turnos.noite) noite[inst.horDia[h]] = 1
    else if (inst.horTurno[h] === turnos.manha && inst.horSeq[h] < primeiros)
      manha[inst.horDia[h]] = 1
  }
  const dias = []
  for (let d = 1; d <= 6; d++) if (noite[d] && manha[d + 1]) dias.push(d)
  return dias
}

export const F3 = {
  codigo: 'F3',
  escopo: 'professor',
  custo: (g, p, cfg) => interjornadas(g, p, cfg).length,
  violacoes(g, p, cfg) {
    const { inst } = g
    return interjornadas(g, p, cfg).map((d) =>
      criarViolacao({
        codigo: 'F3',
        custo: 1,
        aulas: g.porProfessor[p].filter((i) => {
          const h = g.hor[i]
          return (
            (inst.horDia[h] === d && inst.horTurno[h] === inst.interjornada.noite) ||
            (inst.horDia[h] === d + 1 && inst.horTurno[h] === inst.interjornada.manha)
          )
        }),
        recurso: recurso(inst, 'professor', p),
        mensagem: `${inst.rotuloRecurso('professor', p)} leciona à noite na ${inst.rotuloDia(d)} e abre a manhã da ${inst.rotuloDia(d + 1)}`,
      })
    )
  },
}

// F5: aulas em horários que o professor prefere evitar (indisponibilidade não rígida).
function professoresIncomodados(g, i, a) {
  const { inst, H } = g
  const h = g.hor[i]
  return inst.atrProfs[a].filter((p) => inst.indisp.professor[p * H + h] === PREFERE_EVITAR)
}

export const F5 = {
  codigo: 'F5',
  escopo: 'atribuicao',
  custo(g, a) {
    let c = 0
    for (const i of g.porAtribuicao[a]) c += professoresIncomodados(g, i, a).length
    return c
  },
  violacoes(g, a) {
    const { inst } = g
    const lista = []
    for (const i of g.porAtribuicao[a]) {
      for (const p of professoresIncomodados(g, i, a))
        lista.push(
          criarViolacao({
            codigo: 'F5',
            custo: 1,
            aulas: [i],
            recurso: recurso(inst, 'professor', p),
            mensagem: `${inst.rotuloRecurso('professor', p)} prefere não dar aula em ${inst.rotuloHorario(g.hor[i])} (${inst.rotuloAtribuicao(a)})`,
          })
        )
    }
    return lista
  },
}

export const F6 = {
  codigo: 'F6',
  escopo: 'professor',
  custo: (g, p) => contarJanelas(g.inst, horariosDistintos(g, g.porProfessor[p])),
  violacoes(g, p) {
    const { inst } = g
    const lista = []
    contarJanelas(inst, horariosDistintos(g, g.porProfessor[p]), (primeiro, vagos) =>
      lista.push(
        criarViolacao({
          codigo: 'F6',
          custo: vagos,
          aulas: [],
          recurso: recurso(inst, 'professor', p),
          mensagem: `${inst.rotuloRecurso('professor', p)} tem ${plural(vagos, 'janela', 'janelas')} na ${inst.rotuloDia(inst.horDia[primeiro])} (${inst.turnos[inst.horTurno[primeiro]].nome})`,
        })
      )
    )
    return lista
  },
}

function avaliarF7(g, p, cfg) {
  const hs = horariosDistintos(g, g.porProfessor[p])
  if (!hs.length) return { custo: 0, dias: 0, minimo: 0 }
  const porDia = contarPorDia(g.inst, hs)
  let dias = 0
  for (let d = 1; d <= 7; d++) if (porDia[d]) dias++
  const minimo = Math.ceil(hs.length / Math.max(1, cfg.parametros.aulasPorDia ?? 6))
  return { custo: Math.max(0, dias - minimo), dias, minimo }
}

export const F7 = {
  codigo: 'F7',
  escopo: 'professor',
  custo: (g, p, cfg) => avaliarF7(g, p, cfg).custo,
  violacoes(g, p, cfg) {
    const { inst } = g
    const { custo, dias, minimo } = avaliarF7(g, p, cfg)
    if (!custo) return []
    return [
      criarViolacao({
        codigo: 'F7',
        custo,
        aulas: [],
        recurso: recurso(inst, 'professor', p),
        mensagem: `${inst.rotuloRecurso('professor', p)} vem ao campus em ${plural(dias, 'dia', 'dias')}; ${minimo} bastariam`,
      }),
    ]
  },
}

export const F9 = {
  codigo: 'F9',
  escopo: 'professor',
  custo: (g, p, cfg) =>
    excessoPorDia(g.inst, horariosDistintos(g, g.porProfessor[p]), cfg.parametros.maximoPorDia),
  violacoes(g, p, cfg) {
    const { inst } = g
    const maximo = cfg.parametros.maximoPorDia
    const lista = []
    excessoPorDia(inst, horariosDistintos(g, g.porProfessor[p]), maximo, (d, n) =>
      lista.push(
        criarViolacao({
          codigo: 'F9',
          custo: n - maximo,
          aulas: aulasNoDia(g, g.porProfessor[p], d),
          recurso: recurso(inst, 'professor', p),
          mensagem: `${inst.rotuloRecurso('professor', p)} tem ${n} aulas na ${inst.rotuloDia(d)} (limite de ${maximo})`,
        })
      )
    )
    return lista
  },
}

export const FLEXIVEIS = [F1, F2, F3, F4, F5, F6, F7, F8, F9, F10]
