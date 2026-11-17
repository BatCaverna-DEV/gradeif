// F2-09 — Cada restrição com grades pequenas de resultado conhecido.
import { describe, expect, it } from 'vitest'
import { avaliarGrade } from '../src/core/index.js'
import { M, N, V, aula, problemaBase } from './ajuda/problema.js'

// Custo sem peso de uma restrição (soma das violações) e as mensagens.
function avaliar(aulas, extra = {}) {
  const r = avaliarGrade(problemaBase(extra), aulas)
  const custo = (codigo) =>
    r.violacoes.filter((v) => v.codigo === codigo).reduce((s, v) => s + v.custo, 0)
  const mensagens = (codigo) =>
    r.violacoes.filter((v) => v.codigo === codigo).map((v) => v.mensagem)
  return { ...r, custo, mensagens }
}

describe('restrições rígidas', () => {
  it('R1: professor com duas aulas no mesmo horário', () => {
    // Ana dá MAT na INF1M e na INF1N no mesmo horário (turmas diferentes).
    const r = avaliar([aula(1, 1, M, 1, 1), aula(5, 1, M, 1, 2)])
    expect(r.custo('R1')).toBe(1)
    expect(r.custo('R2')).toBe(0)
    expect(r.mensagens('R1')[0]).toBe('professor Ana tem 2 aulas em segunda, 1º tempo (Matutino)')
    expect(r.violacoes.find((v) => v.codigo === 'R1').aulas).toEqual([0, 1])
  })

  it('R2: turma com duas aulas no mesmo horário, salvo grupo paralelo', () => {
    expect(avaliar([aula(1, 1, M, 1, 1), aula(2, 1, M, 1, 2)]).custo('R2')).toBe(1)
    // PROG-A no laboratório e PROG-B em sala, ao mesmo tempo: permitido.
    expect(avaliar([aula(3, 1, M, 1, 3), aula(4, 1, M, 1, 1)]).custo('R2')).toBe(0)
    // Duas aulas da mesma atribuição paralela no mesmo horário: choque.
    expect(avaliar([aula(3, 1, M, 1, 3), aula(3, 1, M, 1, 2)]).custo('R2')).toBe(1)
    // Grupo paralelo mais uma aula comum: choque de uma.
    const r = avaliar([aula(3, 1, M, 1, 3), aula(4, 1, M, 1, 1), aula(1, 1, M, 1, 2)])
    expect(r.custo('R2')).toBe(1)
  })

  it('R3: sala com duas aulas no mesmo horário', () => {
    const r = avaliar([aula(1, 1, M, 1, 1), aula(5, 1, M, 1, 1)])
    expect(r.custo('R3')).toBe(1)
    expect(r.mensagens('R3')[0]).toBe('sala Sala 1 recebe 2 aulas em segunda, 1º tempo (Matutino)')
  })

  it('R4: atribuição com aulas faltando ou sobrando', () => {
    const falta = avaliar([aula(2, 1, M, 1)])
    expect(falta.mensagens('R4')).toContain('INF1M · POR: 1 de 2 aulas alocadas (falta 1 aula)')
    const sobra = avaliar([aula(2, 1, M, 1), aula(2, 2, M, 1), aula(2, 3, M, 1)])
    expect(sobra.mensagens('R4')).toContain('INF1M · POR: 3 de 2 aulas alocadas (sobra 1 aula)')
    // Sem aula nenhuma, todas as atribuições faltam por inteiro: 4 + 2 + 2 + 2 + 4.
    expect(avaliar([]).custo('R4')).toBe(14)
  })

  it('R5: aula fora do turno da turma', () => {
    const r = avaliar([aula(2, 1, V, 1)])
    expect(r.custo('R5')).toBe(1)
    expect(r.mensagens('R5')[0]).toContain('o turno Vespertino não é permitido para a turma INF1M')
  })

  it('R6: indisponibilidade rígida; a não rígida vira preferência (F5)', () => {
    const indisponivel = (rigida) => ({
      indisponibilidades: [
        { tipoRecurso: 'professor', recursoId: 1, horarioId: aula(1, 1, M, 1).horarioId, rigida },
      ],
    })
    const rigida = avaliar([aula(1, 1, M, 1)], indisponivel(true))
    expect(rigida.custo('R6')).toBe(1)
    expect(rigida.custo('F5')).toBe(0)
    expect(rigida.mensagens('R6')[0]).toContain('indisponível para professor Ana')
    const preferencia = avaliar([aula(1, 1, M, 1)], indisponivel(false))
    expect(preferencia.custo('R6')).toBe(0)
    expect(preferencia.custo('F5')).toBe(1)
  })

  it('R6: indisponibilidade da sala e da turma', () => {
    const r = avaliar([aula(2, 1, M, 1, 2)], {
      indisponibilidades: [
        { tipoRecurso: 'sala', recursoId: 2, horarioId: aula(2, 1, M, 1).horarioId },
        { tipoRecurso: 'turma', recursoId: 1, horarioId: aula(2, 1, M, 1).horarioId },
      ],
    })
    expect(r.custo('R6')).toBe(2)
  })

  it('R7: tipo e capacidade da sala', () => {
    // Metade da turma (15) cabe no laboratório de 20.
    expect(avaliar([aula(3, 1, M, 1, 3)]).custo('R7')).toBe(0)
    // Disciplina de laboratório em sala comum.
    expect(avaliar([aula(3, 1, M, 1, 1)]).custo('R7')).toBe(1)
    // Turma inteira (30) no laboratório: tipo errado e falta lugar.
    const r = avaliar([aula(1, 1, M, 1, 3)])
    expect(r.custo('R7')).toBe(2)
    expect(r.mensagens('R7')[0]).toContain('a sala comporta 20 e a turma precisa de 30 lugares')
    // Problema com salas: aula sem sala é violação.
    expect(avaliar([aula(1, 1, M, 1, null)]).custo('R7')).toBe(1)
    // Problema sem salas: R7 não se aplica.
    expect(avaliar([aula(1, 1, M, 1, null)], { salas: [] }).custo('R7')).toBe(0)
  })

  it('R8: aula fixada fora do lugar', () => {
    const fixada = {
      aulasFixadas: [{ atribuicaoId: 2, horarioId: aula(2, 1, M, 1).horarioId, salaId: 1 }],
    }
    expect(avaliar([aula(2, 1, M, 1, 1)], fixada).custo('R8')).toBe(0)
    expect(avaliar([aula(2, 1, M, 1, 2)], fixada).custo('R8')).toBe(1)
    expect(avaliar([aula(2, 2, M, 1, 1)], fixada).custo('R8')).toBe(1)
  })
})

describe('restrições flexíveis da turma', () => {
  it('F1: aulas geminadas em tempos seguidos', () => {
    const juntas = [aula(1, 1, M, 1), aula(1, 1, M, 2), aula(1, 2, M, 1), aula(1, 2, M, 2)]
    expect(avaliar(juntas).custo('F1')).toBe(0)
    // Um dos blocos foi separado por um tempo vago.
    const separadas = [aula(1, 1, M, 1), aula(1, 1, M, 3), aula(1, 2, M, 1), aula(1, 2, M, 2)]
    expect(avaliar(separadas).custo('F1')).toBe(2)
    // Três seguidas e uma solta: um bloco inteiro e duas aulas sem par.
    const tresEUma = [aula(1, 1, M, 1), aula(1, 1, M, 2), aula(1, 1, M, 3), aula(1, 2, M, 1)]
    expect(avaliar(tresEUma).custo('F1')).toBe(2)
    // O fim de um turno e o começo do outro não são tempos seguidos.
    const turnos = [aula(5, 1, N, 4), aula(5, 2, N, 1), aula(5, 3, N, 1), aula(5, 3, N, 2)]
    expect(avaliar(turnos).custo('F1')).toBe(2)
  })

  it('F2: tempos vagos da turma entre aulas do turno', () => {
    expect(avaliar([aula(1, 1, M, 1), aula(2, 1, M, 3, 2)]).custo('F2')).toBe(1)
    const r = avaliar([aula(1, 1, M, 1), aula(2, 1, M, 4, 2)])
    expect(r.custo('F2')).toBe(2)
    expect(r.mensagens('F2')[0]).toBe('turma INF1M tem 2 tempos vagos na segunda (Matutino)')
  })

  it('F4: limite diário da disciplina', () => {
    const tres = [aula(1, 1, M, 1), aula(1, 1, M, 2), aula(1, 1, M, 3)]
    expect(avaliar(tres).custo('F4')).toBe(1)
    expect(
      avaliar(tres, { restricoes: [{ codigo: 'F4', parametros: { maximoPorDia: 3 } }] }).custo('F4')
    ).toBe(0)
  })

  it('F8: aulas espalhadas pela semana', () => {
    // POR tem 2 aulas avulsas: o ideal é uma por dia.
    expect(avaliar([aula(2, 1, M, 1), aula(2, 1, M, 2)]).custo('F8')).toBe(1)
    expect(avaliar([aula(2, 1, M, 1), aula(2, 2, M, 1)]).custo('F8')).toBe(0)
    // MAT tem 2 blocos de 2: dois dias bastam.
    const mat = [aula(1, 1, M, 1), aula(1, 1, M, 2), aula(1, 2, M, 1), aula(1, 2, M, 2)]
    expect(avaliar(mat).custo('F8')).toBe(0)
  })

  it('F10: troca de sala comum no mesmo turno; laboratório não conta', () => {
    const r = avaliar([aula(1, 1, M, 1, 1), aula(2, 1, M, 2, 2)])
    expect(r.custo('F10')).toBe(1)
    expect(r.mensagens('F10')[0]).toBe(
      'turma INF1M passa por 2 salas na segunda (Matutino): Sala 1, Sala 2'
    )
    expect(avaliar([aula(1, 1, M, 1, 1), aula(2, 1, M, 2, 3)]).custo('F10')).toBe(0)
  })
})

describe('restrições flexíveis do professor', () => {
  it('F3: noite seguida dos primeiros tempos da manhã', () => {
    // Ana: MAT da INF1N na segunda à noite e MAT da INF1M na terça, 1º tempo.
    const r = avaliar([aula(5, 1, N, 4), aula(1, 2, M, 1)])
    expect(r.custo('F3')).toBe(1)
    expect(r.mensagens('F3')[0]).toBe(
      'professor Ana leciona à noite na segunda e abre a manhã da terça'
    )
    expect(avaliar([aula(5, 1, N, 4), aula(1, 2, M, 3)]).custo('F3')).toBe(0)
    expect(avaliar([aula(5, 2, N, 4), aula(1, 2, M, 1)]).custo('F3')).toBe(0)
  })

  it('F6: janelas do professor', () => {
    expect(avaliar([aula(1, 1, M, 1), aula(5, 1, N, 1)]).custo('F6')).toBe(0)
    expect(avaliar([aula(1, 1, M, 1), aula(1, 1, M, 4)]).custo('F6')).toBe(2)
  })

  it('F7: dias no campus além do necessário', () => {
    // Bruno: 2 aulas de POR em dias diferentes; um dia bastaria.
    const r = avaliar([aula(2, 1, M, 1), aula(2, 2, M, 1)])
    expect(r.custo('F7')).toBe(1)
    expect(r.mensagens('F7')[0]).toBe('professor Bruno vem ao campus em 2 dias; 1 bastariam')
  })

  it('F9: limite diário do professor', () => {
    const tres = [aula(1, 1, M, 1), aula(1, 1, M, 2), aula(5, 1, N, 1)]
    expect(avaliar(tres).custo('F9')).toBe(0)
    const limite2 = { restricoes: [{ codigo: 'F9', parametros: { maximoPorDia: 2 } }] }
    expect(avaliar(tres, limite2).custo('F9')).toBe(1)
  })
})

describe('pontuação', () => {
  it('multiplica as flexíveis pelo peso e soma as rígidas sem peso', () => {
    // F2 = 2 tempos vagos × peso 9; R5 = 1 aula fora do turno.
    const r = avaliar([aula(1, 1, M, 1), aula(2, 1, M, 4, 1), aula(2, 1, V, 1, 1)])
    expect(r.pontuacaoPorRestricao.F2).toBe(18)
    expect(r.pontuacaoPorRestricao.R5).toBe(1)
    expect(r.valida).toBe(false)
  })

  it('respeita peso configurado e restrição desativada', () => {
    const r = avaliar([aula(1, 1, M, 1), aula(2, 1, M, 4, 1)], {
      restricoes: [
        { codigo: 'F2', peso: 2 },
        { codigo: 'F7', ativa: false },
      ],
    })
    expect(r.pontuacaoPorRestricao.F2).toBe(4)
    expect(r.pontuacaoPorRestricao).not.toHaveProperty('F7')
  })

  it('grade completa e sem choques é válida', () => {
    const aulas = [
      aula(1, 1, M, 1, 1),
      aula(1, 1, M, 2, 1),
      aula(1, 3, M, 1, 1),
      aula(1, 3, M, 2, 1),
      aula(2, 2, M, 1, 1),
      aula(2, 4, M, 1, 1),
      aula(3, 2, M, 2, 3),
      aula(4, 2, M, 2, 1),
      aula(3, 4, M, 2, 3),
      aula(4, 4, M, 2, 1),
      aula(5, 2, N, 1, 2),
      aula(5, 2, N, 2, 2),
      aula(5, 4, N, 3, 2),
      aula(5, 4, N, 4, 2),
    ]
    const r = avaliar(aulas)
    expect(r.custoRigido).toBe(0)
    expect(r.valida).toBe(true)
  })
})
