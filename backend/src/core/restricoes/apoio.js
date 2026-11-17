// Funções comuns aos módulos de restrição.

export function criarViolacao({ codigo, custo = 1, aulas = [], recurso = null, mensagem = '' }) {
  return { codigo, custo, aulas, recurso, mensagem }
}

// Horários distintos ocupados por uma lista de aulas, em ordem crescente
// (que é a ordem do relógio: dia, turno, tempo).
export function horariosDistintos(g, aulas) {
  const hs = []
  for (const i of aulas) hs.push(g.hor[i])
  hs.sort((x, y) => x - y)
  let n = 0
  for (let k = 0; k < hs.length; k++) if (k === 0 || hs[k] !== hs[k - 1]) hs[n++] = hs[k]
  hs.length = n
  return hs
}

// Percorre horários ordenados agrupando por (dia, turno).
// Chama fn(primeiro, ultimo, inicio, fim) com índices em hs: [inicio, fim).
export function porTurnoEDia(inst, hs, fn) {
  let inicio = 0
  for (let k = 1; k <= hs.length; k++) {
    const fimDoGrupo =
      k === hs.length ||
      inst.horDia[hs[k]] !== inst.horDia[hs[inicio]] ||
      inst.horTurno[hs[k]] !== inst.horTurno[hs[inicio]]
    if (fimDoGrupo) {
      fn(hs[inicio], hs[k - 1], inicio, k)
      inicio = k
    }
  }
}

// Tempos vagos entre a primeira e a última aula de cada turno e dia.
export function contarJanelas(inst, hs, aoEncontrar) {
  let total = 0
  porTurnoEDia(inst, hs, (primeiro, ultimo, inicio, fim) => {
    const vagos = inst.horSeq[ultimo] - inst.horSeq[primeiro] + 1 - (fim - inicio)
    if (vagos > 0) {
      total += vagos
      aoEncontrar?.(primeiro, vagos)
    }
  })
  return total
}

// Quantidade de horários distintos por dia da semana (índice = diaSemana).
export function contarPorDia(inst, hs) {
  const porDia = new Int16Array(8)
  for (const h of hs) porDia[inst.horDia[h]]++
  return porDia
}

// Aulas de uma lista que caem num dia.
export const aulasNoDia = (g, aulas, dia) => aulas.filter((i) => g.inst.horDia[g.hor[i]] === dia)

export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
