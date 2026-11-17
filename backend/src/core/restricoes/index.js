// F2-03 — Interface comum de restrição e registro por código.
//
// Cada restrição é um objeto com a forma:
//   {
//     codigo: 'R1',
//     escopo: 'professor' | 'turma' | 'sala' | 'atribuicao',
//     custo(grade, r, config) -> number        // custo sem peso de uma unidade do escopo
//     violacoes(grade, r, config) -> Violacao[] // a mesma avaliação, descrita
//   }
// O custo da grade inteira é a soma do custo de todas as unidades do escopo. Como
// cada restrição só olha a unidade que recebe, avaliar a variação de um movimento
// é recalcular só as unidades que o movimento tocou (ver avaliador.js).
// Uma Violacao tem { codigo, custo, aulas: number[], recurso: { tipo, id }, mensagem }.
// O solver e a tela de ajuste manual usam exatamente os mesmos módulos.

import { CATALOGO, obterRestricao } from './catalogo.js'
import { RIGIDAS } from './rigidas.js'
import { FLEXIVEIS } from './flexiveis.js'

export const ESCOPOS = Object.freeze(['professor', 'turma', 'sala', 'atribuicao'])

const registro = new Map()

export function registrarRestricao(restricao) {
  if (!restricao?.codigo) throw new Error('Restrição precisa de "codigo"')
  if (!obterRestricao(restricao.codigo)) {
    throw new Error(`Código ${restricao.codigo} não existe no catálogo`)
  }
  if (!ESCOPOS.includes(restricao.escopo)) {
    throw new Error(`Restrição ${restricao.codigo}: escopo deve ser ${ESCOPOS.join(', ')}`)
  }
  for (const funcao of ['custo', 'violacoes']) {
    if (typeof restricao[funcao] !== 'function') {
      throw new Error(`Restrição ${restricao.codigo} precisa da função "${funcao}"`)
    }
  }
  registro.set(restricao.codigo, restricao)
  return restricao
}

export function obterModulo(codigo) {
  return registro.get(codigo) ?? null
}

// Na ordem do catálogo (R1..R8, F1..F10).
export function restricoesRegistradas() {
  return CATALOGO.map((r) => registro.get(r.codigo)).filter(Boolean)
}

// Códigos do catálogo que ainda não têm módulo implementado.
export function codigosPendentes() {
  return CATALOGO.map((r) => r.codigo).filter((c) => !registro.has(c))
}

for (const r of [...RIGIDAS, ...FLEXIVEIS]) registrarRestricao(r)

export { criarViolacao } from './apoio.js'
export { CATALOGO, obterRestricao }
