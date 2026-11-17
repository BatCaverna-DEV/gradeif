// Ponto de entrada do núcleo: avaliar uma grade pronta e gerar uma grade nova.

import { Avaliador } from './avaliador.js'
import { Grade } from './grade.js'
import { ErroProblema, criarInstancia } from './instancia.js'

export { resolver } from './solver/index.js'
export { validarProblema, validarSolucao } from './problema.js'
export { ErroProblema, criarInstancia } from './instancia.js'
export { PESO_RIGIDA } from './avaliador.js'

// Monta a grade de uma lista de aulas { atribuicaoId, horarioId, salaId, fixada }.
export function montarGrade(inst, aulas) {
  const g = new Grade(inst)
  const erros = []
  aulas.forEach((aula, k) => {
    const a = inst.idx.atribuicao.get(aula.atribuicaoId)
    const h = inst.idx.horario.get(aula.horarioId)
    const s = aula.salaId == null ? -1 : inst.idx.sala.get(aula.salaId)
    if (a === undefined) erros.push(`Aula ${k + 1}: atribuição ${aula.atribuicaoId} não existe`)
    if (h === undefined) erros.push(`Aula ${k + 1}: horário ${aula.horarioId} não existe`)
    if (s === undefined) erros.push(`Aula ${k + 1}: sala ${aula.salaId} não existe`)
    // Mantém a posição da aula igual à da lista, mesmo com erro, para as violações.
    if (a === undefined || h === undefined || s === undefined) g.adicionar(0)
    else g.adicionar(a, h, s, !!aula.fixada)
  })
  if (erros.length) throw new ErroProblema(`Grade inconsistente: ${erros[0]}`, erros)
  return g
}

// F3-08 e editor: pontuação por restrição e violações de uma grade qualquer.
// As violações apontam aulas pela posição na lista recebida.
export function avaliarGrade(problema, aulas) {
  const inst = criarInstancia(problema)
  const grade = montarGrade(inst, aulas)
  const av = new Avaliador(grade)
  av.avaliarTudo()
  return av.relatorio()
}
