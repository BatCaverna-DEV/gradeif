// Turnos com tempos de tamanhos diferentes no mesmo período do dia: o Noturno com
// aulas de 45 min e um turno Superior com aulas de 1 h, ambos à noite. Aulas em
// tempos que se cruzam no relógio contam como choque de professor, turma e sala.
import { describe, expect, it } from 'vitest'
import { avaliarGrade, criarInstancia, resolver } from '../src/core/index.js'
import { Grade } from '../src/core/grade.js'
import { M, N, aula, h, problemaBase } from './ajuda/problema.js'

const SUP = 4
const TEMPOS_N = [
  ['18:30', '19:15'],
  ['19:15', '20:00'],
  ['20:00', '20:45'],
  ['21:00', '21:45'],
]
const TEMPOS_SUP = [
  ['18:30', '19:30'],
  ['19:30', '20:30'],
  ['20:30', '21:30'],
  ['21:30', '22:30'],
]
const hs = (dia, tempo) => 100 + (dia - 1) * 4 + tempo

function problema(extra = {}) {
  const base = problemaBase()
  const horarios = base.horarios.map((x) =>
    x.turnoId === N
      ? { ...x, horaInicio: TEMPOS_N[x.ordem - 1][0], horaFim: TEMPOS_N[x.ordem - 1][1] }
      : x
  )
  for (let dia = 1; dia <= 5; dia++)
    TEMPOS_SUP.forEach(([horaInicio, horaFim], i) =>
      horarios.push({
        id: hs(dia, i + 1),
        turnoId: SUP,
        diaSemana: dia,
        ordem: i + 1,
        horaInicio,
        horaFim,
      })
    )
  return {
    ...base,
    turnos: [...base.turnos, { id: SUP, nome: 'Superior', ordem: 4 }],
    horarios,
    turmas: [...base.turmas, { id: 3, codigo: 'ADS1', turnosPermitidos: [SUP], numeroAlunos: 30 }],
    atribuicoes: [
      ...base.atribuicoes,
      {
        id: 6,
        turmaId: 3,
        disciplinaId: 5,
        rotulo: 'ADS1 · ALG',
        professores: [1],
        aulasSemanais: 2,
      },
      {
        id: 7,
        turmaId: 3,
        disciplinaId: 6,
        rotulo: 'ADS1 · BD',
        professores: [3],
        aulasSemanais: 2,
      },
    ],
    ...extra,
  }
}

const sup = (atribuicaoId, dia, tempo, salaId = 2) => ({
  atribuicaoId,
  horarioId: hs(dia, tempo),
  salaId,
})

function avaliar(aulas, extra) {
  const r = avaliarGrade(problema(extra), aulas)
  const custo = (codigo) =>
    r.violacoes.filter((v) => v.codigo === codigo).reduce((s, v) => s + v.custo, 0)
  const mensagens = (codigo) =>
    r.violacoes.filter((v) => v.codigo === codigo).map((v) => v.mensagem)
  return { ...r, custo, mensagens }
}

describe('tempos que se cruzam entre turnos', () => {
  it('liga cada tempo aos tempos de outros turnos que se cruzam no mesmo dia', () => {
    const inst = criarInstancia(problema())
    const idx = (id) => inst.idx.horario.get(id)
    const ids = (lista) => lista.map((i) => inst.horarios[i].id).sort((a, b) => a - b)
    expect(inst.temSobreposicao).toBe(true)
    // 19:15–20:00 cruza 18:30–19:30 e 19:30–20:30, só na segunda.
    expect(ids(inst.sobre[idx(h(1, N, 2))])).toEqual([hs(1, 1), hs(1, 2)])
    // 21:00–21:45 cruza 20:30–21:30 e 21:30–22:30.
    expect(ids(inst.sobre[idx(h(1, N, 4))])).toEqual([hs(1, 3), hs(1, 4)])
    // Tempos encostados (20:00 e 20:00) não se cruzam; manhã não cruza a noite.
    expect(ids(inst.sobre[idx(hs(1, 3))])).toEqual([h(1, N, 3), h(1, N, 4)])
    expect(inst.sobre[idx(h(1, M, 1))]).toHaveLength(0)
  })

  it('não vê sobreposição em grades sem hora nos tempos', () => {
    expect(criarInstancia(problemaBase()).temSobreposicao).toBe(false)
  })

  it('a grade considera ocupado o professor em tempo que se cruza', () => {
    const inst = criarInstancia(problema())
    const g = new Grade(inst)
    const idx = (id) => inst.idx.horario.get(id)
    const ana = inst.idx.professor.get(1)
    const i = g.adicionar(inst.idx.atribuicao.get(5), idx(h(1, N, 2)), 0) // INF1N · MAT
    expect(g.professorLivre(ana, idx(hs(1, 1)))).toBe(false)
    expect(g.professorLivre(ana, idx(hs(1, 2)))).toBe(false)
    expect(g.professorLivre(ana, idx(hs(1, 3)))).toBe(true)
    expect(g.aulasDoProfessor(ana, idx(hs(1, 2)))).toEqual([i])
    expect(g.salaLivre(0, idx(hs(1, 1)))).toBe(false)
    expect(g.salaLivre(1, idx(hs(1, 1)))).toBe(true)
  })

  it('R1: professor com aulas em tempos que se cruzam', () => {
    // Ana: INF1N às 19:15–20:00 e ADS1 às 18:30–19:30, na segunda.
    const r = avaliar([aula(5, 1, N, 2, 1), sup(6, 1, 1)])
    expect(r.custo('R1')).toBe(1)
    expect(r.custo('R3')).toBe(0)
    expect(r.mensagens('R1')[0]).toBe(
      'professor Ana tem aulas que se cruzam: segunda, 2º tempo (Noturno), 19:15–20:00 e segunda, 1º tempo (Superior), 18:30–19:30'
    )
    expect(r.violacoes.find((v) => v.codigo === 'R1').aulas).toEqual([0, 1])
    // 20:30–21:30 não cruza 19:15–20:00; terça não cruza segunda.
    expect(avaliar([aula(5, 1, N, 2, 1), sup(6, 1, 3)]).custo('R1')).toBe(0)
    expect(avaliar([aula(5, 1, N, 2, 1), sup(6, 2, 1)]).custo('R1')).toBe(0)
  })

  it('R3: sala com aulas em tempos que se cruzam', () => {
    // Ana no Noturno e Carla no Superior, na mesma Sala 1.
    const r = avaliar([aula(5, 1, N, 3, 1), sup(7, 1, 3, 1)])
    expect(r.custo('R1')).toBe(0)
    expect(r.custo('R3')).toBe(1)
    expect(r.mensagens('R3')[0]).toContain('sala Sala 1 recebe aulas que se cruzam')
  })

  it('R6: indisponibilidade do professor vale nos tempos que se cruzam', () => {
    const extra = {
      indisponibilidades: [
        { tipoRecurso: 'professor', recursoId: 1, horarioId: h(1, N, 2), rigida: true },
      ],
    }
    expect(avaliar([sup(6, 1, 2)], extra).custo('R6')).toBe(1)
    expect(avaliar([sup(6, 1, 3)], extra).custo('R6')).toBe(0)
    // Preferência (não rígida) passa como preferência.
    const preferencia = {
      indisponibilidades: [{ ...extra.indisponibilidades[0], rigida: false }],
    }
    const r = avaliar([sup(6, 1, 1)], preferencia)
    expect(r.custo('R6')).toBe(0)
    expect(r.custo('F5')).toBe(1)
  })

  it('F3: turno que cruza o Noturno também conta como noite', () => {
    // Ana dá aula no Superior na segunda à noite e abre a manhã de terça.
    const r = avaliar([sup(6, 1, 4), aula(1, 2, M, 1, 1)])
    expect(r.custo('F3')).toBe(1)
  })

  it('o solver não põe o professor em tempos que se cruzam', () => {
    // Ana só pode na segunda à noite: INF1N (2 aulas seguidas, 45 min) e ADS1
    // (2 aulas de 1 h). Sem cruzar, só cabem 18:30–20:00 no Noturno e 20:30–22:30
    // no Superior.
    const indisponibilidades = []
    for (let dia = 2; dia <= 5; dia++)
      for (let t = 1; t <= 4; t++) {
        indisponibilidades.push(
          { tipoRecurso: 'professor', recursoId: 1, horarioId: h(dia, N, t), rigida: true },
          { tipoRecurso: 'professor', recursoId: 1, horarioId: hs(dia, t), rigida: true }
        )
      }
    const p = problema({
      indisponibilidades,
      opcoes: { semente: 'cruzados', maxIteracoes: 5000, tempoLimiteMs: 30_000 },
    })
    p.atribuicoes = p.atribuicoes.map((a) =>
      a.id === 5 ? { ...a, aulasSemanais: 2, tamanhoBloco: 2 } : a
    )
    const s = resolver(p)
    expect(s.valida).toBe(true)
    const daAna = (id) =>
      s.aulas
        .filter((x) => x.atribuicaoId === id)
        .map((x) => x.horarioId)
        .sort((a, b) => a - b)
    expect(daAna(5)).toEqual([h(1, N, 1), h(1, N, 2)])
    expect(daAna(6)).toEqual([hs(1, 3), hs(1, 4)])
    expect(avaliarGrade(p, s.aulas).pontuacaoPorRestricao.R1 ?? 0).toBe(0)
  })
})
