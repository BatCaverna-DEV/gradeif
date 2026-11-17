import { describe, expect, it } from 'vitest'
import { CATALOGO, configuracaoInicial, ehRigida } from '../src/core/restricoes/catalogo.js'
import {
  codigosPendentes,
  obterModulo,
  registrarRestricao,
  restricoesRegistradas,
} from '../src/core/restricoes/index.js'
import { criarAleatorio } from '../src/core/aleatorio.js'
import { ErroProblema, criarInstancia } from '../src/core/instancia.js'
import { problemaBase } from './ajuda/problema.js'
import { validarProblema } from '../src/core/problema.js'

describe('catálogo de restrições', () => {
  it('tem 8 rígidas e 10 flexíveis', () => {
    expect(CATALOGO.filter((r) => r.tipo === 'rigida')).toHaveLength(8)
    expect(CATALOGO.filter((r) => r.tipo === 'flexivel')).toHaveLength(10)
  })

  it('usa os pesos iniciais da descrição', () => {
    const pesos = Object.fromEntries(configuracaoInicial().map((r) => [r.codigo, r.peso]))
    expect(pesos).toMatchObject({
      F1: 9,
      F2: 9,
      F3: 8,
      F4: 7,
      F5: 6,
      F6: 6,
      F7: 5,
      F8: 4,
      F9: 4,
      F10: 3,
    })
  })

  it('identifica restrições rígidas', () => {
    expect(ehRigida('R1')).toBe(true)
    expect(ehRigida('F1')).toBe(false)
  })
})

describe('registro de restrições', () => {
  it('tem um módulo para cada código do catálogo', () => {
    expect(codigosPendentes()).toEqual([])
    expect(restricoesRegistradas().map((r) => r.codigo)).toEqual(CATALOGO.map((r) => r.codigo))
    expect(obterModulo('R1').escopo).toBe('professor')
    expect(obterModulo('F2').escopo).toBe('turma')
  })

  it('recusa código fora do catálogo ou módulo incompleto', () => {
    const modulo = { escopo: 'turma', custo: () => 0, violacoes: () => [] }
    expect(() => registrarRestricao({ ...modulo, codigo: 'X9' })).toThrow('não existe no catálogo')
    expect(() => registrarRestricao({ ...modulo, codigo: 'R1', escopo: 'dia' })).toThrow('escopo')
    expect(() => registrarRestricao({ codigo: 'R1', escopo: 'turma', custo: () => 0 })).toThrow(
      'violacoes'
    )
  })
})

describe('gerador aleatório', () => {
  it('repete a sequência com a mesma semente', () => {
    const a = criarAleatorio('2027.1')
    const b = criarAleatorio('2027.1')
    const c = criarAleatorio('2027.2')
    const sa = Array.from({ length: 5 }, () => a.proximo())
    expect(Array.from({ length: 5 }, () => b.proximo())).toEqual(sa)
    expect(Array.from({ length: 5 }, () => c.proximo())).not.toEqual(sa)
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true)
  })

  it('embaralha sem perder elementos', () => {
    const r = criarAleatorio('x')
    expect(r.embaralhar([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('instância do problema', () => {
  it('ordena horários por dia, turno e tempo e liga tempos seguidos', () => {
    const inst = criarInstancia(problemaBase())
    expect(inst.H).toBe(60)
    // Segunda, matutino: 4 tempos seguidos; o 4º não continua no vespertino.
    expect(inst.prox[0]).toBe(1)
    expect(inst.prox[3]).toBe(-1)
    expect(inst.rotuloHorario(0)).toBe('segunda, 1º tempo (Matutino)')
    expect(inst.interjornada).toEqual({ noite: 2, manha: 0 })
  })

  it('divide a capacidade necessária entre os grupos paralelos', () => {
    const inst = criarInstancia(problemaBase())
    expect(inst.atrCapacidade[2]).toBe(15)
    expect(inst.atrSalas[2]).toEqual([2]) // só o laboratório serve
  })

  it('aponta referências inexistentes', () => {
    const p = problemaBase()
    p.atribuicoes[0].professores = [99]
    p.turmas[0].turnosPermitidos = [7]
    let erro
    try {
      criarInstancia(p)
    } catch (e) {
      erro = e
    }
    expect(erro).toBeInstanceOf(ErroProblema)
    expect(erro.detalhes).toEqual(
      expect.arrayContaining([
        'Turma INF1M: turno 7 não existe',
        'Atribuição 1: professor 99 não existe',
      ])
    )
  })
})

describe('formato do problema', () => {
  const minimo = {
    horarios: [{ id: 1, turnoId: 1, diaSemana: 1, ordem: 1 }],
    turmas: [{ id: 1, codigo: 'INF1M', turnosPermitidos: [1] }],
    professores: [{ id: 1, nome: 'Ana' }],
    salas: [{ id: 1, nome: 'Sala 1' }],
    atribuicoes: [{ id: 1, turmaId: 1, disciplinaId: 1, professores: [1], aulasSemanais: 2 }],
  }

  it('aceita um problema mínimo e preenche os padrões', () => {
    const p = validarProblema(minimo)
    expect(p.atribuicoes[0].tamanhoBloco).toBe(1)
    expect(p.opcoes.semente).toBe('1')
    expect(p.aulasFixadas).toEqual([])
  })

  it('recusa atribuição sem professor', () => {
    const invalido = {
      ...minimo,
      atribuicoes: [{ ...minimo.atribuicoes[0], professores: [] }],
    }
    expect(() => validarProblema(invalido)).toThrow()
  })
})
