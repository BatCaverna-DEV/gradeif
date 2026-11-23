// F1-21 — Consulta e correção pontual dos cadastros, pela API (base horarios_test).
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import request from 'supertest'
import { db, encerrarBanco } from '../src/db/knex.js'
import { criarApp } from '../src/app.js'
import { GESTOR, criarGestor, criarPeriodo, limparBanco } from './ajuda/banco.js'
import { importarTudo } from './ajuda/planilhas.js'
import { criarVersao } from '../src/servicos/versoes.js'

const banco = inject('bancoDisponivel')

describe.skipIf(!banco)('dados (F1-21)', () => {
  const app = criarApp()
  let periodo
  let agente
  let base

  const id = async (tabela, where) => (await db(tabela).where(where).first('id')).id
  const atribuicaoId = async (turma, disciplina) =>
    (
      await db('atribuicao as a')
        .join('turma as t', 't.id', 'a.turma_id')
        .join('disciplina as d', 'd.id', 'a.disciplina_id')
        .where({ 't.codigo': turma, 'd.sigla': disciplina })
        .whereNull('a.versao_id')
        .first('a.id')
    ).id

  // Cria um horário (com cópia das atribuições da oferta) e põe nele uma aula da
  // atribuição informada, para testar o impacto das correções.
  async function alocar(atribuicao, sala) {
    const versao = await criarVersao(periodo.periodoId, { nome: 'Teste' })
    const base = await db('atribuicao').where({ id: atribuicao }).first()
    const copia = await db('atribuicao')
      .where({ versao_id: versao.id, turma_id: base.turma_id, disciplina_id: base.disciplina_id })
      .first('id')
    const horario = await db('horario').where({ turno_id: periodo.turnos.Matutino }).first('id')
    const [aulaId] = await db('aula').insert({
      versao_id: versao.id,
      atribuicao_id: copia.id,
      horario_id: horario.id,
      sala_id: sala,
    })
    return aulaId
  }
  const revisar = async (aulaId) => (await db('aula').where({ id: aulaId }).first()).revisar

  beforeEach(async () => {
    await limparBanco()
    periodo = await criarPeriodo()
    await importarTudo(periodo.periodoId)
    await criarGestor()
    agente = request.agent(app)
    await agente.post('/api/auth/login').send(GESTOR).expect(200)
    base = `/api/periodos/${periodo.periodoId}/dados`
  })

  afterAll(async () => {
    await encerrarBanco()
  })

  describe('listagem', () => {
    it('professores trazem a carga atribuída no período', async () => {
      const { body } = await agente.get(`${base}/professores`).expect(200)
      expect(body.map((p) => [p.nome, p.cargaAtribuida, p.atribuicoes, p.cargaMaxima])).toEqual([
        ['Ana Souza', 12, 3, 20],
        ['Bruno Lima', 4, 1, 16],
      ])
    })

    it('turmas comparam aulas semanais com os tempos dos turnos permitidos', async () => {
      const { body } = await agente.get(`${base}/turmas`).expect(200)
      expect(body[0]).toMatchObject({
        codigo: 'INF1M',
        curso: 'Técnico em Informática',
        nivel: 'integrado',
        turnos: [periodo.turnos.Matutino],
        aulasSemanais: 8,
        temposDisponiveis: 10, // 2 tempos x 5 dias
      })
    })

    it('atribuições trazem turma, disciplina e professores', async () => {
      const { body } = await agente.get(`${base}/atribuicoes`).expect(200)
      const prog = body.find((a) => a.disciplina === 'PROG1')
      expect(prog).toMatchObject({
        turma: 'INF1M',
        disciplinaNome: 'Programação I',
        aulasSemanais: 4,
        tamanhoBloco: 2,
      })
      expect(prog.professoresDetalhe.map((p) => p.nome)).toEqual(['Ana Souza', 'Bruno Lima'])
    })

    it('disciplinas e salas', async () => {
      const disciplinas = (await agente.get(`${base}/disciplinas`).expect(200)).body
      expect(disciplinas.map((d) => [d.sigla, d.atribuicoes])).toEqual([
        ['MAT1', 2],
        ['PROG1', 1],
      ])
      const salas = (await agente.get(`${base}/salas`).expect(200)).body
      expect(salas.map((s) => s.nome)).toEqual(['Lab. Informática', 'Sala 1'])
    })

    it('recusa entidade desconhecida e exige gestor', async () => {
      await agente.get(`${base}/cursos`).expect(400)
      await request(app).get(`${base}/professores`).expect(401)
    })
  })

  describe('correção', () => {
    it('corrige um professor e normaliza o e-mail', async () => {
      const bruno = await id('professor', { siape: '2222222' })
      const { body } = await agente
        .put(`${base}/professores/${bruno}`)
        .send({
          nome: 'Bruno A. Lima',
          siape: '2222222',
          email: 'BRUNO@IFMA.EDU.BR',
          cargaMaxima: 18,
          ativo: true,
        })
        .expect(200)
      expect(body.registro).toMatchObject({
        nome: 'Bruno A. Lima',
        email: 'bruno@ifma.edu.br',
        cargaMaxima: 18,
      })
      expect(body.aulasMarcadas).toBe(0)
    })

    it('recusa SIAPE de outro professor e e-mail inválido', async () => {
      const bruno = await id('professor', { siape: '2222222' })
      const dup = await agente
        .put(`${base}/professores/${bruno}`)
        .send({ nome: 'Bruno', siape: '1111111', email: '', cargaMaxima: 16, ativo: true })
        .expect(409)
      expect(dup.body.erro).toBe('Já existe professor com o SIAPE 1111111')

      const invalido = await agente
        .put(`${base}/professores/${bruno}`)
        .send({ nome: 'Bruno', siape: '2222222', email: 'sem-arroba', cargaMaxima: 0, ativo: true })
        .expect(400)
      expect(invalido.body.detalhes.map((d) => d.campo)).toEqual(['email', 'cargaMaxima'])
    })

    it('mudar os turnos da turma marca as aulas dela para revisão', async () => {
      const aula = await alocar(
        await atribuicaoId('INF1M', 'MAT1'),
        await id('sala', { nome: 'Sala 1' })
      )
      const turma = await id('turma', { codigo: 'INF1M' })
      const corpo = {
        codigo: 'INF1M',
        curso: 'Técnico em Informática',
        nivel: 'integrado',
        turnos: [periodo.turnos.Vespertino],
        numeroAlunos: 35,
      }
      const { body } = await agente.put(`${base}/turmas/${turma}`).send(corpo).expect(200)
      expect(body.aulasMarcadas).toBe(1)
      expect(body.registro.temposDisponiveis).toBe(10)
      expect(await revisar(aula)).toBe(1)
    })

    it('corrigir só o código da turma não mexe na grade', async () => {
      const aula = await alocar(
        await atribuicaoId('INF1M', 'MAT1'),
        await id('sala', { nome: 'Sala 1' })
      )
      const turma = await id('turma', { codigo: 'INF1M' })
      const { body } = await agente
        .put(`${base}/turmas/${turma}`)
        .send({
          codigo: 'INF-1M',
          curso: 'Técnico em Informática',
          nivel: 'integrado',
          turnos: [periodo.turnos.Matutino],
          numeroAlunos: 35,
        })
        .expect(200)
      expect(body).toMatchObject({ alterados: ['codigo'], aulasMarcadas: 0 })
      expect(await revisar(aula)).toBe(0)
    })

    it('recusa turno de outro período', async () => {
      const outro = await criarPeriodo('2027.2')
      const turma = await id('turma', { codigo: 'INF1M' })
      const { body } = await agente
        .put(`${base}/turmas/${turma}`)
        .send({
          codigo: 'INF1M',
          curso: 'X',
          nivel: 'integrado',
          turnos: [outro.turnos.Matutino],
          numeroAlunos: 1,
        })
        .expect(400)
      expect(body.detalhes[0]).toEqual({
        campo: 'turnos',
        mensagem: 'Há turno que não pertence a este período',
      })
    })

    it('troca os professores de uma atribuição da oferta sem mexer nos horários', async () => {
      const mat = await atribuicaoId('INF1M', 'MAT1')
      const bruno = await id('professor', { siape: '2222222' })
      const aula = await alocar(mat, await id('sala', { nome: 'Sala 1' }))

      await agente
        .put(`${base}/atribuicoes/${mat}`)
        .send({ professores: [bruno], aulasSemanais: 2, tamanhoBloco: 3, grupoParalelo: '' })
        .expect(400)

      const { body } = await agente
        .put(`${base}/atribuicoes/${mat}`)
        .send({ professores: [bruno], aulasSemanais: 4, tamanhoBloco: 2, grupoParalelo: '' })
        .expect(200)
      expect(body.registro.professoresDetalhe.map((p) => p.nome)).toEqual(['Bruno Lima'])
      // O horário tem a própria cópia da atribuição: a aula dele não muda nem é marcada.
      expect(body).toMatchObject({ alterados: ['professores'], aulasMarcadas: 0 })
      expect(await revisar(aula)).toBe(0)
      const copia = await db('aula as au')
        .join('atribuicao_professor as ap', 'ap.atribuicao_id', 'au.atribuicao_id')
        .join('professor as p', 'p.id', 'ap.professor_id')
        .where('au.id', aula)
        .pluck('p.nome')
      expect(copia).toEqual(['Ana Souza'])
    })

    it('reduzir a capacidade da sala marca as aulas nela', async () => {
      const sala = await id('sala', { nome: 'Sala 1' })
      const aula = await alocar(await atribuicaoId('INF1M', 'MAT1'), sala)
      const { body } = await agente
        .put(`${base}/salas/${sala}`)
        .send({ nome: 'Sala 1', tipo: 'Sala', capacidade: 20, ativa: true })
        .expect(200)
      expect(body.registro).toMatchObject({ tipo: 'sala', capacidade: 20 })
      expect(body.aulasMarcadas).toBe(1)
      expect(await revisar(aula)).toBe(1)
    })

    it('não encontra atribuição de outro período', async () => {
      const outro = await criarPeriodo('2027.2')
      const mat = await atribuicaoId('INF1M', 'MAT1')
      await agente
        .put(`/api/periodos/${outro.periodoId}/dados/atribuicoes/${mat}`)
        .send({ professores: [1], aulasSemanais: 4, tamanhoBloco: 2 })
        .expect(404)
    })
  })

  describe('cadastro de professor', () => {
    const novo = {
      nome: 'Carla Mendes',
      siape: '',
      email: 'Carla@IFMA.edu.br',
      cargaMaxima: 16,
      ativo: true,
    }

    const professores = () => `${base}/professores`

    it('cadastra professor sem SIAPE e ele aparece na lista', async () => {
      const { body } = await agente.post(professores()).send(novo).expect(201)
      expect(body.registro).toMatchObject({
        nome: 'Carla Mendes',
        siape: null,
        email: 'carla@ifma.edu.br',
        cargaMaxima: 16,
        cargaAtribuida: 0,
      })
      const lista = (await agente.get(professores())).body
      expect(lista.map((p) => p.nome)).toContain('Carla Mendes')
    })

    it('cor automática, escolhida e de volta à automática', async () => {
      const { body } = await agente.post(professores()).send(novo).expect(201)
      const { id } = body.registro
      expect(body.registro).toMatchObject({ corEscolhida: null })
      const automatica = body.registro.cor
      expect(automatica).toMatch(/^#[0-9a-f]{6}$/)

      const escolhida = await agente
        .put(`${professores()}/${id}`)
        .send({ ...novo, cor: '#FF8800' })
        .expect(200)
      expect(escolhida.body.registro).toMatchObject({ cor: '#ff8800', corEscolhida: '#ff8800' })

      const devolvida = await agente
        .put(`${professores()}/${id}`)
        .send({ ...novo, cor: '' })
        .expect(200)
      expect(devolvida.body.registro).toMatchObject({ cor: automatica, corEscolhida: null })

      await agente
        .put(`${professores()}/${id}`)
        .send({ ...novo, cor: 'laranja' })
        .expect(400)
    })

    it('recusa nome ou SIAPE repetidos e dados inválidos', async () => {
      await agente.post(professores()).send(novo).expect(201)
      const nome = await agente
        .post(professores())
        .send({ ...novo, nome: 'carla  MENDES' })
        .expect(409)
      expect(nome.body.detalhes).toEqual([
        { campo: 'nome', mensagem: 'Já existe professor com este nome' },
      ])
      await agente
        .post(professores())
        .send({ ...novo, nome: 'Outra', siape: '1111111' })
        .expect(409)
      await agente
        .post(professores())
        .send({ ...novo, nome: 'X', email: 'sem' })
        .expect(400)
      await agente.post(`${base}/turmas`).send({ codigo: 'X' }).expect(400)
      // Renomear para o nome de outro também é recusado.
      const bruno = await id('professor', { siape: '2222222' })
      await agente
        .put(`${professores()}/${bruno}`)
        .send({ nome: 'Ana Souza', siape: '2222222', email: '', cargaMaxima: 16, ativo: true })
        .expect(409)
    })
  })

  describe('cadastro de disciplina', () => {
    const url = () => `${base}/disciplinas`

    it('cadastra com sigla gerada pelo nome ou informada', async () => {
      const gerada = (
        await agente
          .post(url())
          .send({ nome: 'Banco de Dados II', tipoAmbiente: 'Laboratório de Informática' })
          .expect(201)
      ).body.registro
      expect(gerada).toMatchObject({
        sigla: 'BDII',
        nome: 'Banco de Dados II',
        tipoAmbiente: 'laboratorio de informatica',
        atribuicoes: 0,
      })
      // Sigla gerada que já existe ganha um número.
      const outra = (await agente.post(url()).send({ nome: 'Bases de Dados II' }).expect(201)).body
      expect(outra.registro.sigla).toBe('BDII2')
      const informada = (
        await agente.post(url()).send({ sigla: 'ED', nome: 'Estruturas de Dados' }).expect(201)
      ).body.registro
      expect(informada).toMatchObject({ sigla: 'ED', tipoAmbiente: 'sala' })
    })

    it('recusa sigla ou nome repetidos', async () => {
      const sigla = await agente.post(url()).send({ sigla: 'mat1', nome: 'Outra' }).expect(409)
      expect(sigla.body.detalhes).toEqual([
        { campo: 'sigla', mensagem: 'Já existe disciplina com esta sigla' },
      ])
      const nome = await agente.post(url()).send({ nome: 'MATEMATICA I' }).expect(409)
      expect(nome.body.detalhes).toEqual([
        { campo: 'nome', mensagem: 'Já existe disciplina com este nome' },
      ])
      await agente.post(url()).send({ nome: '' }).expect(400)
    })
  })

  describe('cadastro de sala', () => {
    const url = () => `${base}/salas`

    it('cadastra sala ativa, com tipo normalizado, e ela aparece na lista', async () => {
      const { body } = await agente
        .post(url())
        .send({ nome: 'Lab. Redes', tipo: 'Laboratório de Informática', capacidade: 30 })
        .expect(201)
      expect(body.registro).toMatchObject({
        nome: 'Lab. Redes',
        tipo: 'laboratorio de informatica',
        capacidade: 30,
        ativa: true,
      })
      const inativa = (
        await agente
          .post(url())
          .send({ nome: 'Auditório', tipo: '', capacidade: 120, ativa: false })
          .expect(201)
      ).body.registro
      expect(inativa).toMatchObject({ tipo: 'sala', ativa: false })
      const lista = (await agente.get(url())).body
      expect(lista.map((s) => s.nome)).toEqual([
        'Auditório',
        'Lab. Informática',
        'Lab. Redes',
        'Sala 1',
      ])
    })

    it('recusa nome repetido (sem diferenciar acento e maiúscula) e dados inválidos', async () => {
      const repetida = await agente
        .post(url())
        .send({ nome: 'lab. informatica', tipo: 'sala', capacidade: 20 })
        .expect(409)
      expect(repetida.body.detalhes).toEqual([
        { campo: 'nome', mensagem: 'Já existe sala com este nome' },
      ])
      await agente.post(url()).send({ nome: '', tipo: 'sala', capacidade: 20 }).expect(400)
      await agente.post(url()).send({ nome: 'Sala 9', tipo: 'sala', capacidade: 0 }).expect(400)
      // Renomear para o nome de outra também é recusado.
      const sala1 = await id('sala', { nome: 'Sala 1' })
      await agente
        .put(`${url()}/${sala1}`)
        .send({ nome: 'LAB. INFORMÁTICA', tipo: 'sala', capacidade: 40, ativa: true })
        .expect(409)
    })
  })

  describe('cadastro de turma', () => {
    it('cadastra turma no semestre, com curso novo, e recusa código repetido', async () => {
      const corpo = {
        codigo: '4 TDS',
        curso: 'Téc. Desenv. Sistemas',
        nivel: 'integrado',
        turnos: [periodo.turnos.Vespertino],
        numeroAlunos: 32,
      }
      const { body } = await agente.post(`${base}/turmas`).send(corpo).expect(201)
      expect(body.registro).toMatchObject({
        codigo: '4 TDS',
        curso: 'Téc. Desenv. Sistemas',
        turnos: [periodo.turnos.Vespertino],
        turnosDefinidos: true,
        aulasSemanais: 0,
        temposDisponiveis: 10,
      })
      const repetida = await agente.post(`${base}/turmas`).send(corpo).expect(409)
      expect(repetida.body.detalhes).toEqual([
        { campo: 'codigo', mensagem: 'Já existe turma com este código no período' },
      ])
      // Outro semestre pode ter uma turma com o mesmo código.
      const outro = await criarPeriodo('2027.2')
      await agente
        .post(`/api/periodos/${outro.periodoId}/dados/turmas`)
        .send({ ...corpo, turnos: [outro.turnos.Vespertino] })
        .expect(201)
      await agente
        .post(`${base}/turmas`)
        .send({ ...corpo, codigo: 'Y', turnos: [] })
        .expect(400)
      await agente
        .post(`${base}/turmas`)
        .send({ ...corpo, codigo: 'Z', turnos: [outro.turnos.Matutino] })
        .expect(400)
    })
  })

  describe('exclusão', () => {
    it('protege professor com atribuições e libera depois que ele sai delas', async () => {
      const bruno = await id('professor', { siape: '2222222' })
      const recusa = await agente.delete(`${base}/professores/${bruno}`).expect(409)
      expect(recusa.body.erro).toMatch(/está em 1 atribuição/)

      await agente.delete(`${base}/atribuicoes/${await atribuicaoId('INF1M', 'PROG1')}`).expect(204)
      await agente.delete(`${base}/professores/${bruno}`).expect(204)
      expect(await db('professor').where({ id: bruno }).first()).toBeUndefined()
    })

    it('não exclui turma com aulas; a atribuição sai da oferta e fica nos horários', async () => {
      const mat = await atribuicaoId('INF1M', 'MAT1')
      const aula = await alocar(mat, await id('sala', { nome: 'Sala 1' }))
      await agente.delete(`${base}/turmas/${await id('turma', { codigo: 'INF1M' })}`).expect(409)
      await agente.delete(`${base}/atribuicoes/${mat}`).expect(204)
      expect(await db('aula').where({ id: aula }).first()).toBeTruthy()
    })

    it('excluir turma sem aulas leva junto as atribuições dela', async () => {
      await agente.delete(`${base}/turmas/${await id('turma', { codigo: 'INF1V' })}`).expect(204)
      expect(await db('atribuicao').count({ n: '*' }).first()).toEqual({ n: 2 })
    })
  })
})
