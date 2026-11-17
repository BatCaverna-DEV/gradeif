// F2-16 — Montador do problema: dados do período no formato do núcleo.
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import request from 'supertest'
import { criarApp } from '../src/app.js'
import { db, encerrarBanco } from '../src/db/knex.js'
import { configuracaoInicial } from '../src/core/restricoes/catalogo.js'
import { resolver, validarProblema } from '../src/core/index.js'
import { montarProblema } from '../src/servicos/problema.js'
import { criarVersao } from '../src/servicos/versoes.js'
import { GESTOR, criarGestor, criarPeriodo, limparBanco } from './ajuda/banco.js'
import { importarTudo } from './ajuda/planilhas.js'

const banco = inject('bancoDisponivel')

describe.skipIf(!banco)('montador do problema', () => {
  let periodo

  beforeEach(async () => {
    await limparBanco()
    periodo = await criarPeriodo()
    await db('restricao_config').insert(
      configuracaoInicial().map((r) => ({
        periodo_id: periodo.periodoId,
        codigo: r.codigo,
        ativa: r.codigo !== 'F7',
        peso: r.peso,
        parametros: r.parametros ? JSON.stringify(r.parametros) : null,
      }))
    )
    await importarTudo(periodo.periodoId)
  })

  afterAll(async () => {
    await encerrarBanco()
  })

  it('exporta o período num problema válido que o solver resolve', async () => {
    const { problema, avisos } = await montarProblema(periodo.periodoId, {
      opcoes: { semente: 's', maxIteracoes: 2000 },
    })
    expect(avisos).toEqual([])
    const p = validarProblema(problema)
    expect(p.turnos.map((t) => t.nome)).toEqual(['Matutino', 'Vespertino', 'Noturno'])
    expect(p.horarios).toHaveLength(30)
    expect(p.horarios[0]).toMatchObject({ diaSemana: 1, ordem: 1, horaInicio: '07:00' })
    expect(p.turmas.find((t) => t.codigo === 'INF1V').turnosPermitidos).toEqual([
      periodo.turnos.Vespertino,
    ])
    expect(p.atribuicoes.map((a) => a.rotulo)).toEqual([
      'INF1M · MAT1',
      'INF1M · PROG1',
      'INF1V · MAT1',
    ])
    expect(p.atribuicoes[1]).toMatchObject({
      tipoAmbiente: 'laboratorio de informatica',
      tamanhoBloco: 2,
    })
    expect(p.atribuicoes[1].professores).toHaveLength(2)
    expect(p.restricoes.find((r) => r.codigo === 'F7').ativa).toBe(false)
    expect(p.restricoes.find((r) => r.codigo === 'F4').parametros).toEqual({ maximoPorDia: 2 })

    // 2 tempos por turno: os blocos de 2 cabem; o laboratório (20) não comporta a INF1M (35).
    const s = resolver(problema)
    expect(s.naoAlocados).toEqual([])
    expect(s.aulas).toHaveLength(12)
    expect(s.custoRigido).toBe(4) // R7: 4 aulas de PROG1 em laboratório pequeno
    expect(s.pontuacaoPorRestricao.R7).toBe(4)
    expect(s.pontuacaoPorRestricao).not.toHaveProperty('F7')
  })

  it('deixa de fora professor inativo e atribuição sem professor ativo', async () => {
    await db('professor').where({ siape: '1111111' }).update({ ativo: false })
    const { problema, avisos } = await montarProblema(periodo.periodoId)
    expect(avisos).toEqual([
      'Professor inativo fora da geração: Ana Souza',
      'Atribuição INF1M · MAT1 fora da geração: nenhum professor ativo',
      'Atribuição INF1V · MAT1 fora da geração: nenhum professor ativo',
    ])
    expect(problema.atribuicoes).toHaveLength(1)
    expect(problema.professores.map((p) => p.nome)).toEqual(['Bruno Lima'])
  })

  it('leva as atribuições e as aulas fixadas do horário indicado', async () => {
    const { id: versaoId } = await criarVersao(periodo.periodoId, { nome: 'v1' })
    const atribuicao = await db('atribuicao').where({ versao_id: versaoId }).first()
    // Só neste horário: a atribuição passa a ter 1 aula.
    await db('atribuicao')
      .where({ id: atribuicao.id })
      .update({ aulas_semanais: 1, tamanho_bloco: 1 })
    const horario = await db('horario').where({ periodo_id: periodo.periodoId }).first()
    await db('aula').insert([
      { versao_id: versaoId, atribuicao_id: atribuicao.id, horario_id: horario.id, fixada: true },
      {
        versao_id: versaoId,
        atribuicao_id: atribuicao.id,
        horario_id: horario.id + 1,
        fixada: false,
      },
    ])
    const { problema } = await montarProblema(periodo.periodoId, { versaoId })
    expect(problema.aulasFixadas).toEqual([
      { atribuicaoId: atribuicao.id, horarioId: horario.id, salaId: null, fixada: true },
    ])
    expect(problema.atribuicoes.map((a) => a.id)).toContain(atribuicao.id)
    expect(problema.atribuicoes.find((a) => a.id === atribuicao.id).aulasSemanais).toBe(1)
    const daOferta = await montarProblema(periodo.periodoId)
    expect(daOferta.problema.atribuicoes.map((a) => a.id)).not.toContain(atribuicao.id)
    await expect(montarProblema(periodo.periodoId, { versaoId: 999 })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('serve o problema pela API só para o gestor', async () => {
    await criarGestor()
    const app = criarApp()
    await request(app).get(`/api/periodos/${periodo.periodoId}/problema`).expect(401)
    const agente = request.agent(app)
    await agente.post('/api/auth/login').send(GESTOR).expect(200)
    const { body } = await agente.get(`/api/periodos/${periodo.periodoId}/problema`).expect(200)
    expect(body.atribuicoes).toHaveLength(3)
    expect(body.avisos).toEqual([])
    expect(() => validarProblema(body)).not.toThrow()
  })

  it('recusa período sem atribuições', async () => {
    const vazio = await criarPeriodo('2027.2')
    await expect(montarProblema(vazio.periodoId)).rejects.toMatchObject({ status: 400 })
  })
})
