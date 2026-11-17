// F1-14 — Salvar de novo a grade horária preserva turnos e horários existentes.
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { db, encerrarBanco } from '../src/db/knex.js'
import { definirGradeHoraria, obterGradeHoraria } from '../src/servicos/periodos.js'
import { criarPeriodo, limparBanco } from './ajuda/banco.js'
import { importarTudo } from './ajuda/planilhas.js'

const banco = inject('bancoDisponivel')

// A grade criada por criarPeriodo, no formato que a tela envia.
const GRADE = {
  dias: [1, 2, 3, 4, 5],
  turnos: [
    {
      nome: 'Matutino',
      tempos: [
        { horaInicio: '07:00', horaFim: '07:50' },
        { horaInicio: '07:50', horaFim: '08:40' },
      ],
    },
    {
      nome: 'Vespertino',
      tempos: [
        { horaInicio: '13:00', horaFim: '13:50' },
        { horaInicio: '13:50', horaFim: '14:40' },
      ],
    },
    {
      nome: 'Noturno',
      tempos: [
        { horaInicio: '18:30', horaFim: '19:20' },
        { horaInicio: '19:20', horaFim: '20:10' },
      ],
    },
  ],
}

const copia = () => structuredClone(GRADE)

describe.skipIf(!banco)('grade horária do período', () => {
  let periodo

  beforeEach(async () => {
    await limparBanco()
    periodo = await criarPeriodo()
  })

  afterAll(async () => {
    await encerrarBanco()
  })

  it('salvar de novo mantém os ids e só ajusta o que mudou', async () => {
    const antes = await obterGradeHoraria(periodo.periodoId)
    const [indisponivel] = antes.horarios
    await db('indisponibilidade').insert({
      periodo_id: periodo.periodoId,
      tipo_recurso: 'professor',
      recurso_id: 1,
      horario_id: indisponivel.id,
    })

    const grade = copia()
    grade.turnos[0].tempos[0].horaFim = '07:45' // muda um horário
    grade.turnos[0].tempos.push({ horaInicio: '08:40', horaFim: '09:30' }) // acrescenta um tempo
    const depois = await definirGradeHoraria(periodo.periodoId, grade)

    expect(depois.turnos.map((t) => t.id)).toEqual(antes.turnos.map((t) => t.id))
    const idsAntes = antes.horarios.map((h) => h.id)
    expect(depois.horarios.filter((h) => idsAntes.includes(h.id))).toHaveLength(idsAntes.length)
    expect(depois.horarios).toHaveLength(35) // 30 + 1 tempo novo em 5 dias
    expect(depois.horarios.find((h) => h.id === indisponivel.id).horaFim).toBe('07:45')
    expect(await db('indisponibilidade').count({ n: '*' }).first()).toEqual({ n: 1 })
  })

  it('tirar um dia remove só os horários daquele dia', async () => {
    const grade = copia()
    grade.dias = [1, 2, 3, 4]
    const depois = await definirGradeHoraria(periodo.periodoId, grade)
    expect(depois.dias).toEqual([1, 2, 3, 4])
    expect(depois.horarios).toHaveLength(24)
  })

  it('recusa remover ou renomear turno usado por turma', async () => {
    await importarTudo(periodo.periodoId) // INF1V usa o Vespertino
    const grade = copia()
    grade.turnos = grade.turnos.filter((t) => t.nome !== 'Vespertino')
    await expect(definirGradeHoraria(periodo.periodoId, grade)).rejects.toMatchObject({
      status: 409,
      message:
        'O turno Vespertino é usado pelas turmas INF1V; ajuste-as antes de removê-lo ou renomeá-lo',
    })
    expect((await obterGradeHoraria(periodo.periodoId)).turnos).toHaveLength(3)
  })

  it('remove turno sem turmas e recusa nomes repetidos', async () => {
    const semNoturno = copia()
    semNoturno.turnos.pop()
    expect((await definirGradeHoraria(periodo.periodoId, semNoturno)).turnos).toHaveLength(2)

    const repetida = copia()
    repetida.turnos[1].nome = 'matutino'
    await expect(definirGradeHoraria(periodo.periodoId, repetida)).rejects.toMatchObject({
      status: 400,
    })
  })
})
