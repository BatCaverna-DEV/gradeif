// Disponibilidade por horário: cada horário tem a sua, copiada do padrão do período.
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import request from 'supertest'
import { criarApp } from '../src/app.js'
import { db, encerrarBanco } from '../src/db/knex.js'
import { montarProblema } from '../src/servicos/problema.js'
import { GESTOR, criarGestor, criarPeriodo, limparBanco } from './ajuda/banco.js'
import { importarTudo } from './ajuda/planilhas.js'

const banco = inject('bancoDisponivel')

describe.skipIf(!banco)('disponibilidade por horário', () => {
  let periodoId
  let gestor
  let app
  let ana
  let horarios

  const base = () => `/api/periodos/${periodoId}/disponibilidade`
  const daAna = (versao) => `${base()}/professor/${ana.id}${versao ? `?versao=${versao}` : ''}`

  beforeEach(async () => {
    await limparBanco()
    ;({ periodoId } = await criarPeriodo())
    await importarTudo(periodoId)
    await criarGestor()
    app = criarApp()
    gestor = request.agent(app)
    await gestor.post('/api/auth/login').send(GESTOR).expect(200)
    ana = await db('professor').where({ siape: '1111111' }).first()
    horarios = await db('horario').where({ periodo_id: periodoId }).orderBy('id').limit(4)
  })

  afterAll(async () => {
    await encerrarBanco()
  })

  it('o horário novo copia o padrão e depois muda sem afetar o padrão nem outros horários', async () => {
    await gestor
      .put(daAna())
      .send({ itens: [{ horarioId: horarios[0].id, rigida: true, motivo: 'Outro campus' }] })
      .expect(200)

    const a = (await gestor.post(`/api/periodos/${periodoId}/versoes`).send({ nome: 'A' })).body
    const b = (await gestor.post(`/api/periodos/${periodoId}/versoes`).send({ nome: 'B' })).body
    expect((await gestor.get(daAna(a.id)).expect(200)).body.itens).toEqual([
      { horarioId: horarios[0].id, rigida: true, motivo: 'Outro campus' },
    ])

    // No horário A, Ana fica livre no 1º tempo e indisponível no 2º.
    await gestor
      .put(daAna(a.id))
      .send({ itens: [{ horarioId: horarios[1].id, rigida: true }] })
      .expect(200)
    expect((await gestor.get(daAna()).expect(200)).body.itens.map((i) => i.horarioId)).toEqual([
      horarios[0].id,
    ])
    expect((await gestor.get(daAna(b.id))).body.itens.map((i) => i.horarioId)).toEqual([
      horarios[0].id,
    ])

    // O solver usa a disponibilidade do horário.
    const { problema } = await montarProblema(periodoId, { versaoId: a.id })
    expect(problema.indisponibilidades).toEqual([
      { tipoRecurso: 'professor', recursoId: ana.id, horarioId: horarios[1].id, rigida: true },
    ])

    // Resumo por horário e "usar o padrão".
    const resumo = (await gestor.get(`${base()}/professores?versao=${a.id}`).expect(200)).body
    expect(resumo.find((p) => p.id === ana.id)).toMatchObject({ indisponiveis: 1 })
    const padrao = (await gestor.post(`${base()}/professor/${ana.id}/usar-padrao?versao=${a.id}`))
      .body
    expect(padrao.itens.map((i) => i.horarioId)).toEqual([horarios[0].id])

    // A cópia de um horário leva a disponibilidade dele.
    await gestor.put(daAna(a.id)).send({ itens: [{ horarioId: horarios[2].id, rigida: false }] })
    const c = (
      await gestor.post(`/api/periodos/${periodoId}/versoes`).send({ nome: 'C', copiarDe: a.id })
    ).body
    expect((await gestor.get(daAna(c.id))).body.itens).toEqual([
      { horarioId: horarios[2].id, rigida: false, motivo: null },
    ])
  })

  it('horário publicado não muda e o professor só mexe no padrão', async () => {
    const a = (await gestor.post(`/api/periodos/${periodoId}/versoes`).send({ nome: 'A' })).body
    await db('versao_grade').where({ id: a.id }).update({ publicada: true })
    await gestor.put(daAna(a.id)).send({ itens: [] }).expect(409)
    await gestor.get(`${base()}/professor/${ana.id}?versao=9999`).expect(404)

    await gestor
      .post('/api/usuarios')
      .send({
        nome: 'Ana',
        email: 'ana@teste.local',
        perfil: 'professor',
        professorId: ana.id,
        senha: 'senha-ana-1',
      })
      .expect(201)
    const professora = request.agent(app)
    await professora
      .post('/api/auth/login')
      .send({ email: 'ana@teste.local', senha: 'senha-ana-1' })
    await professora.get(daAna(a.id)).expect(403)
    await professora.get(`${base()}/professores?versao=${a.id}`).expect(403)
    await professora
      .put(daAna())
      .send({ itens: [{ horarioId: horarios[3].id, rigida: false }] })
      .expect(200)
  })
})
