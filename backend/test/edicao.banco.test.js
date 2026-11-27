// Fase 4 — Simulação de movimento e alterações do editor manual.
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import request from 'supertest'
import { criarApp } from '../src/app.js'
import { db, encerrarBanco } from '../src/db/knex.js'
import { GESTOR, criarGestor, criarPeriodo, limparBanco } from './ajuda/banco.js'
import { importarTudo } from './ajuda/planilhas.js'
import { criarVersao } from '../src/servicos/versoes.js'

const banco = inject('bancoDisponivel')

describe.skipIf(!banco)('editor manual (API)', () => {
  let agente
  let base
  let ids

  // Horário do período de teste: dia 1..5, turno pelo nome, tempo 1 ou 2.
  const horario = (dia, turno, ordem) =>
    ids.horarios.find((h) => h.dia === dia && h.turno === turno && h.ordem === ordem).id

  beforeEach(async () => {
    await limparBanco()
    const { periodoId } = await criarPeriodo()
    await importarTudo(periodoId)
    const gestorId = await criarGestor()
    agente = request.agent(criarApp())
    await agente.post('/api/auth/login').send(GESTOR).expect(200)

    // Horário com cópia das atribuições da oferta; as aulas usam as cópias.
    const { id: versaoId } = await criarVersao(periodoId, { nome: 'Manual' }, gestorId)
    const atribuicoes = await db('atribuicao as a')
      .join('turma as t', 't.id', 'a.turma_id')
      .join('disciplina as d', 'd.id', 'a.disciplina_id')
      .where('a.versao_id', versaoId)
      .select('a.id', db.raw("CONCAT(t.codigo, ' ', d.sigla) as nome"))
    const atr = Object.fromEntries(atribuicoes.map((a) => [a.nome, a.id]))
    const horarios = await db('horario as h')
      .join('turno as t', 't.id', 'h.turno_id')
      .select('h.id', 'h.dia_semana as dia', 'h.ordem', 't.nome as turno')
    const salas = Object.fromEntries((await db('sala')).map((s) => [s.nome, s.id]))
    ids = { atr, horarios, salas }

    // INF1M: MAT1 geminada na segunda, PROG1 geminada na terça; INF1V: MAT1 segunda à tarde.
    const aulas = [
      ['INF1M MAT1', 1, 'Matutino', 1, 'Sala 1'],
      ['INF1M MAT1', 1, 'Matutino', 2, 'Sala 1'],
      ['INF1M PROG1', 2, 'Matutino', 1, 'Lab. Informática'],
      ['INF1M PROG1', 2, 'Matutino', 2, 'Lab. Informática'],
      ['INF1V MAT1', 1, 'Vespertino', 1, 'Sala 1'],
    ]
    const criadas = []
    for (const [a, dia, turno, ordem, sala] of aulas) {
      const [id] = await db('aula').insert({
        versao_id: versaoId,
        atribuicao_id: atr[a],
        horario_id: horario(dia, turno, ordem),
        sala_id: salas[sala],
      })
      criadas.push(id)
    }
    ids.aulas = criadas
    ids.versaoId = versaoId
    ids.periodoId = periodoId
    base = `/api/periodos/${periodoId}/versoes/${versaoId}/edicao`
  })

  afterAll(async () => {
    await encerrarBanco()
  })

  it('carrega aulas, avaliação e o que falta alocar', async () => {
    const { body } = await agente.get(base).expect(200)
    expect(body.aulas).toHaveLength(5)
    expect(body.faltantes.map((f) => [`${f.turma} ${f.sigla}`, f.faltam])).toEqual([
      ['INF1M MAT1', 2],
      ['INF1M PROG1', 2],
      ['INF1V MAT1', 3],
    ])
    expect(body.avaliacao.pontuacaoPorRestricao.R4).toBe(7)
  })

  it('classifica cada horário para uma aula alocada (F4-01)', async () => {
    const { body } = await agente.post(`${base}/simular`).send({ aulaId: ids.aulas[0] }).expect(200)
    const celula = (dia, turno, ordem) =>
      body.celulas.find((c) => c.horarioId === horario(dia, turno, ordem))
    expect(body.celulas).toHaveLength(30)
    expect(celula(1, 'Matutino', 1).nivel).toBe('atual')
    // A própria aula não ocupa a professora.
    expect(celula(1, 'Matutino', 1).professor).toBe('livre')
    // À tarde: fora do turno da turma e Ana já dá aula na INF1V.
    const tarde = celula(1, 'Vespertino', 1)
    expect(tarde.nivel).toBe('rigida')
    expect(tarde.motivos.some((m) => m.startsWith('R5:'))).toBe(true)
    expect(tarde.motivos.some((m) => m.startsWith('R1:'))).toBe(true)
    // Terça de manhã: a turma já tem PROG1 (R2).
    expect(celula(2, 'Matutino', 1).motivos.some((m) => m.startsWith('R2:'))).toBe(true)
    // Quarta de manhã: só separa a geminada (flexível).
    const quarta = celula(3, 'Matutino', 1)
    expect(quarta.nivel).toBe('flexivel')
    expect(quarta.motivos.some((m) => m.startsWith('F1:'))).toBe(true)
    expect(quarta.salaId).toBe(ids.salas['Sala 1'])
  })

  it('simula uma aula nova de atribuição com aulas faltando', async () => {
    const { body } = await agente
      .post(`${base}/simular`)
      .send({ atribuicaoId: ids.atr['INF1V MAT1'] })
      .expect(200)
    const celula = (dia, turno, ordem) =>
      body.celulas.find((c) => c.horarioId === horario(dia, turno, ordem))
    expect(celula(1, 'Vespertino', 1).nivel).toBe('rigida') // turma já ocupada
    expect(celula(3, 'Vespertino', 1).nivel).not.toBe('rigida')
    expect(celula(3, 'Vespertino', 1).salaId).toBe(ids.salas['Sala 1'])
    // Disponibilidade da professora (Ana dá MAT1 na INF1M e na INF1V).
    expect(celula(1, 'Matutino', 1).professor).toBe('ocupado')
    expect(celula(1, 'Vespertino', 1).professor).toBe('ocupado')
    expect(celula(3, 'Vespertino', 1).professor).toBe('livre')
    await agente.post(`${base}/simular`).send({}).expect(400)
  })

  it('só escolhe sala por conta própria com a R7 ativa', async () => {
    await db('aula').where({ id: ids.aulas[0] }).update({ sala_id: null })
    const simular = async (dados) =>
      (await agente.post(`${base}/simular`).send(dados).expect(200)).body.celulas.find(
        (c) => c.horarioId === horario(3, 'Matutino', 1)
      ).salaId

    // R7 ativa (o padrão): aula sem sala é violação, e o editor escolhe uma.
    expect(await simular({ aulaId: ids.aulas[0] })).toBe(ids.salas['Sala 1'])

    // R7 desativada: aula sem sala continua sem sala, a aula nova também, e a que
    // tem sala fica com a dela.
    await db('restricao_config')
      .insert({ periodo_id: ids.periodoId, codigo: 'R7', ativa: false, peso: 5 })
      .onConflict(['periodo_id', 'codigo'])
      .merge(['ativa'])
    expect(await simular({ aulaId: ids.aulas[0] })).toBeNull()
    expect(await simular({ atribuicaoId: ids.atr['INF1V MAT1'] })).toBeNull()
    expect(await simular({ aulaId: ids.aulas[2] })).toBe(ids.salas['Lab. Informática'])
  })

  it('move uma aula, limpa a revisão e atualiza a pontuação da versão', async () => {
    await db('aula').where({ id: ids.aulas[1] }).update({ revisar: true })
    const destino = horario(3, 'Matutino', 1)
    const { body } = await agente
      .post(`${base}/posicionar`)
      .send({
        movimentos: [{ aulaId: ids.aulas[1], horarioId: destino, salaId: ids.salas['Sala 1'] }],
      })
      .expect(200)
    expect(body.alteradas).toHaveLength(1)
    expect(body.alteradas[0]).toMatchObject({ horarioId: destino, revisar: false, sigla: 'MAT1' })
    expect(body.antes[0]).toMatchObject({ aulaId: ids.aulas[1], revisar: true })
    expect(body.avaliacao.pontuacaoPorRestricao.F1).toBeGreaterThan(0)
    const versao = await db('versao_grade').where({ id: ids.versaoId }).first()
    expect(Number(versao.pontuacao)).toBe(body.avaliacao.pontuacao)

    // Desfazer = posicionar de novo com o "antes".
    await agente.post(`${base}/posicionar`).send({ movimentos: body.antes }).expect(200)
    const aula = await db('aula').where({ id: ids.aulas[1] }).first()
    expect(aula).toMatchObject({ horario_id: horario(1, 'Matutino', 2), revisar: 1 })
  })

  it('recusa sala ocupada com mensagem clara', async () => {
    const { body } = await agente
      .post(`${base}/posicionar`)
      .send({
        movimentos: [
          {
            aulaId: ids.aulas[4],
            horarioId: horario(1, 'Matutino', 1),
            salaId: ids.salas['Sala 1'],
          },
        ],
      })
      .expect(409)
    expect(body.erro).toBe(
      'A sala Sala 1 já tem aula em segunda, 1º tempo (Matutino); escolha outra sala ou deixe a aula sem sala'
    )
    // Sem sala, o movimento passa (e a avaliação aponta R7).
    const ok = await agente
      .post(`${base}/posicionar`)
      .send({
        movimentos: [{ aulaId: ids.aulas[4], horarioId: horario(1, 'Matutino', 1), salaId: null }],
      })
      .expect(200)
    expect(
      ok.body.avaliacao.violacoes.some((v) => v.codigo === 'R7' && v.aulas.includes(ids.aulas[4]))
    ).toBe(true)
  })

  it('troca duas aulas (F4-05) mantendo cada sala quando livre', async () => {
    const [mat, , prog] = ids.aulas
    const { body } = await agente
      .post(`${base}/trocar`)
      .send({ aulaA: mat, aulaB: prog })
      .expect(200)
    const porId = Object.fromEntries(body.alteradas.map((a) => [a.id, a]))
    expect(porId[mat]).toMatchObject({ horarioId: horario(2, 'Matutino', 1), sala: 'Sala 1' })
    expect(porId[prog]).toMatchObject({
      horarioId: horario(1, 'Matutino', 1),
      sala: 'Lab. Informática',
    })
    expect(body.antes).toHaveLength(2)
    await agente.post(`${base}/trocar`).send({ aulaA: mat, aulaB: mat }).expect(400)
  })

  it('aloca aula faltante, remove, fixa e marca como revisada', async () => {
    const criada = await agente
      .post(`${base}/aulas`)
      .send({
        atribuicaoId: ids.atr['INF1V MAT1'],
        horarioId: horario(3, 'Vespertino', 1),
        salaId: ids.salas['Sala 1'],
      })
      .expect(201)
    expect(criada.body.criada).toBeGreaterThan(0)
    expect(criada.body.faltantes.find((f) => f.turma === 'INF1V').faltam).toBe(2)

    const removida = await agente.delete(`${base}/aulas/${criada.body.criada}`).expect(200)
    expect(removida.body.removidas).toEqual([criada.body.criada])
    expect(removida.body.removida).toMatchObject({
      atribuicaoId: ids.atr['INF1V MAT1'],
      fixada: false,
    })

    const fixada = await agente
      .put(`${base}/aulas/${ids.aulas[0]}`)
      .send({ fixada: true })
      .expect(200)
    expect(fixada.body.alteradas[0].fixada).toBe(true)
    await db('aula').where({ id: ids.aulas[0] }).update({ revisar: true })
    const revisada = await agente
      .put(`${base}/aulas/${ids.aulas[0]}`)
      .send({ revisar: false })
      .expect(200)
    expect(revisada.body.alteradas[0].revisar).toBe(false)
    await agente.delete(`${base}/aulas/999999`).expect(404)
  })

  it('não edita a versão publicada', async () => {
    await db('versao_grade').where({ id: ids.versaoId }).update({ publicada: true })
    const { body } = await agente
      .put(`${base}/aulas/${ids.aulas[0]}`)
      .send({ fixada: true })
      .expect(409)
    expect(body.erro).toMatch(/duplique-a/)
    // Simular continua permitido (só leitura).
    await agente.post(`${base}/simular`).send({ aulaId: ids.aulas[0] }).expect(200)
  })
})
