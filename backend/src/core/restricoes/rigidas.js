// F2-04 e F2-05 — Restrições rígidas R1 a R8.
//
// Cada módulo avalia uma unidade do seu escopo (um professor, uma turma, uma sala
// ou uma atribuição). O custo é contado em unidades sem peso: aulas em choque,
// aulas faltando, aulas fora do turno etc.

import { INDISPONIVEL } from '../instancia.js'
import { criarViolacao, plural } from './apoio.js'

const recurso = (inst, tipo, r) => ({ tipo, id: inst.idRecurso(tipo, r) })

// Choque genérico de professor (R1) ou sala (R3): células com mais de uma aula.
function celulasEmChoque(g, lista, celulas, r, fn) {
  const { H } = g
  const vistos = new Set()
  for (const i of lista) {
    const h = g.hor[i]
    if (vistos.has(h)) continue
    vistos.add(h)
    const cel = celulas[r * H + h]
    if (cel.length > 1) fn(h, cel)
  }
}

export const R1 = {
  codigo: 'R1',
  escopo: 'professor',
  custo(g, p) {
    let c = 0
    celulasEmChoque(g, g.porProfessor[p], g.celProfessor, p, (_h, cel) => (c += cel.length - 1))
    return c
  },
  violacoes(g, p) {
    const { inst } = g
    const lista = []
    celulasEmChoque(g, g.porProfessor[p], g.celProfessor, p, (h, cel) =>
      lista.push(
        criarViolacao({
          codigo: 'R1',
          custo: cel.length - 1,
          aulas: [...cel],
          recurso: recurso(inst, 'professor', p),
          mensagem: `${inst.rotuloRecurso('professor', p)} tem ${cel.length} aulas em ${inst.rotuloHorario(h)}`,
        })
      )
    )
    return lista
  },
}

// Turma: aulas paralelas do mesmo grupo contam como uma só ocupação, desde que
// sejam de atribuições diferentes. Custo = ocupações - 1.
function custoCelulaTurma(g, cel) {
  if (cel.length <= 1) return 0
  const { atrGrupo } = g.inst
  let ocupacoes = 0
  for (let k = 0; k < cel.length; k++) {
    const a = g.atr[cel[k]]
    const grupo = atrGrupo[a]
    if (grupo < 0) {
      ocupacoes++
      continue
    }
    let repetida = false
    let grupoContado = false
    for (let j = 0; j < k; j++) {
      const b = g.atr[cel[j]]
      if (b === a) repetida = true
      else if (atrGrupo[b] === grupo) grupoContado = true
    }
    if (repetida || !grupoContado) ocupacoes++
  }
  return ocupacoes - 1
}

function celulasDaTurma(g, t, fn) {
  const { H } = g
  const vistos = new Set()
  for (const i of g.porTurma[t]) {
    const h = g.hor[i]
    if (vistos.has(h)) continue
    vistos.add(h)
    const cel = g.celTurma[t * H + h]
    const c = custoCelulaTurma(g, cel)
    if (c > 0) fn(h, cel, c)
  }
}

export const R2 = {
  codigo: 'R2',
  escopo: 'turma',
  custo(g, t) {
    let total = 0
    celulasDaTurma(g, t, (_h, _cel, c) => (total += c))
    return total
  },
  violacoes(g, t) {
    const { inst } = g
    const lista = []
    celulasDaTurma(g, t, (h, cel, c) =>
      lista.push(
        criarViolacao({
          codigo: 'R2',
          custo: c,
          aulas: [...cel],
          recurso: recurso(inst, 'turma', t),
          mensagem: `${inst.rotuloRecurso('turma', t)} tem aulas em choque em ${inst.rotuloHorario(h)}: ${cel.map((i) => inst.rotuloAtribuicao(g.atr[i])).join(', ')}`,
        })
      )
    )
    return lista
  },
}

export const R3 = {
  codigo: 'R3',
  escopo: 'sala',
  custo(g, s) {
    let c = 0
    celulasEmChoque(g, g.porSala[s], g.celSala, s, (_h, cel) => (c += cel.length - 1))
    return c
  },
  violacoes(g, s) {
    const { inst } = g
    const lista = []
    celulasEmChoque(g, g.porSala[s], g.celSala, s, (h, cel) =>
      lista.push(
        criarViolacao({
          codigo: 'R3',
          custo: cel.length - 1,
          aulas: [...cel],
          recurso: recurso(inst, 'sala', s),
          mensagem: `${inst.rotuloRecurso('sala', s)} recebe ${cel.length} aulas em ${inst.rotuloHorario(h)}`,
        })
      )
    )
    return lista
  },
}

export const R4 = {
  codigo: 'R4',
  escopo: 'atribuicao',
  custo(g, a) {
    return Math.abs(g.porAtribuicao[a].length - g.inst.atrAulas[a])
  },
  violacoes(g, a) {
    const { inst } = g
    const alocadas = g.porAtribuicao[a].length
    const diferenca = alocadas - inst.atrAulas[a]
    if (diferenca === 0) return []
    const texto =
      diferenca < 0
        ? `${diferenca === -1 ? 'falta' : 'faltam'} ${plural(-diferenca, 'aula', 'aulas')}`
        : `${diferenca === 1 ? 'sobra' : 'sobram'} ${plural(diferenca, 'aula', 'aulas')}`
    return [
      criarViolacao({
        codigo: 'R4',
        custo: Math.abs(diferenca),
        aulas: diferenca > 0 ? [...g.porAtribuicao[a]] : [],
        recurso: recurso(inst, 'atribuicao', a),
        mensagem: `${inst.rotuloAtribuicao(a)}: ${alocadas} de ${inst.atrAulas[a]} aulas alocadas (${texto})`,
      }),
    ]
  },
}

// Restrições avaliadas aula por aula, agrupadas por atribuição.
function porAula(codigo, custoDaAula, mensagem) {
  return {
    codigo,
    escopo: 'atribuicao',
    custo(g, a) {
      let c = 0
      for (const i of g.porAtribuicao[a]) c += custoDaAula(g, i, a)
      return c
    },
    violacoes(g, a) {
      const lista = []
      for (const i of g.porAtribuicao[a]) {
        const c = custoDaAula(g, i, a)
        if (c > 0)
          lista.push(
            criarViolacao({
              codigo,
              custo: c,
              aulas: [i],
              recurso: recurso(g.inst, 'atribuicao', a),
              mensagem: mensagem(g, i, a),
            })
          )
      }
      return lista
    },
  }
}

export const R5 = porAula(
  'R5',
  (g, i, a) => (g.inst.turmaTurnos[g.inst.atrTurma[a]][g.inst.horTurno[g.hor[i]]] ? 0 : 1),
  (g, i, a) => {
    const { inst } = g
    const turno = inst.turnos[inst.horTurno[g.hor[i]]].nome
    return `${inst.rotuloAtribuicao(a)} em ${inst.rotuloHorario(g.hor[i])}: o turno ${turno} não é permitido para a ${inst.rotuloRecurso('turma', inst.atrTurma[a])}`
  }
)

// Quem está indisponível no horário da aula: professores, turma e sala.
function indisponiveis(g, i, a) {
  const { inst, H } = g
  const h = g.hor[i]
  const quem = []
  for (const p of inst.atrProfs[a])
    if (inst.indisp.professor[p * H + h] === INDISPONIVEL) quem.push(['professor', p])
  const t = inst.atrTurma[a]
  if (inst.indisp.turma[t * H + h] === INDISPONIVEL) quem.push(['turma', t])
  const s = g.sala[i]
  if (s >= 0 && inst.indisp.sala[s * H + h] === INDISPONIVEL) quem.push(['sala', s])
  return quem
}

export const R6 = porAula(
  'R6',
  (g, i, a) => indisponiveis(g, i, a).length,
  (g, i, a) => {
    const { inst } = g
    const nomes = indisponiveis(g, i, a).map(([tipo, r]) => inst.rotuloRecurso(tipo, r))
    return `${inst.rotuloAtribuicao(a)} em ${inst.rotuloHorario(g.hor[i])}: indisponível para ${nomes.join(', ')}`
  }
)

function problemasDeSala(g, i, a) {
  const { inst } = g
  if (inst.S === 0) return []
  const s = g.sala[i]
  if (s < 0) return ['sem sala']
  const problemas = []
  if (inst.salaTipo[s] !== inst.atrTipo[a])
    problemas.push(
      `a sala é do tipo "${inst.salaTipo[s]}" e a disciplina exige "${inst.atrTipo[a]}"`
    )
  if (inst.salaCapacidade[s] < inst.atrCapacidade[a])
    problemas.push(
      `a sala comporta ${inst.salaCapacidade[s]} e a turma precisa de ${inst.atrCapacidade[a]} lugares`
    )
  return problemas
}

export const R7 = porAula(
  'R7',
  (g, i, a) => problemasDeSala(g, i, a).length,
  (g, i, a) => {
    const { inst } = g
    const s = g.sala[i]
    const onde = s >= 0 ? ` na ${inst.rotuloRecurso('sala', s)}` : ''
    return `${inst.rotuloAtribuicao(a)} em ${inst.rotuloHorario(g.hor[i])}${onde}: ${problemasDeSala(g, i, a).join('; ')}`
  }
)

// Aulas fixadas da atribuição que não estão no horário e na sala definidos.
function fixadasDescumpridas(g, a) {
  const fixadas = g.inst.fixadasPorAtr[a]
  if (!fixadas.length) return []
  return fixadas.filter(
    (f) => !g.porAtribuicao[a].some((i) => g.hor[i] === f.h && (f.s < 0 || g.sala[i] === f.s))
  )
}

export const R8 = {
  codigo: 'R8',
  escopo: 'atribuicao',
  custo: (g, a) => fixadasDescumpridas(g, a).length,
  violacoes(g, a) {
    const { inst } = g
    return fixadasDescumpridas(g, a).map((f) =>
      criarViolacao({
        codigo: 'R8',
        custo: 1,
        aulas: [],
        recurso: recurso(inst, 'atribuicao', a),
        mensagem: `${inst.rotuloAtribuicao(a)}: a aula fixada em ${inst.rotuloHorario(f.h)}${f.s >= 0 ? ` na ${inst.rotuloRecurso('sala', f.s)}` : ''} saiu do lugar`,
      })
    )
  },
}

export const RIGIDAS = [R1, R2, R3, R4, R5, R6, R7, R8]
