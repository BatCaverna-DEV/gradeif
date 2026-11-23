// Editor de cada horário: só ele altera; os outros gestores visualizam, e o
// editor transfere a edição. Horário sem editor válido pode ser assumido.
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { criarApp } from '../src/app.js'
import { db, encerrarBanco } from '../src/db/knex.js'
import { GESTOR, criarGestor, criarPeriodo, limparBanco } from './ajuda/banco.js'
import { importarTudo } from './ajuda/planilhas.js'

const banco = inject('bancoDisponivel')

const OUTRO = { email: 'outro@teste.local', senha: 'senha-do-outro' }

async function criarUsuario({ nome, email, senha, perfil = 'gestor', professorId = null }) {
  const [id] = await db('usuario').insert({
    nome,
    email,
    senha_hash: await bcrypt.hash(senha, 4),
    perfil,
    professor_id: professorId,
  })
  return id
}

describe.skipIf(!banco)('editor do horário', () => {
  let app
  let periodoId
  let a // gestor que cria o horário
  let b // outro gestor
  let idA
  let idB
  let base

  beforeEach(async () => {
    await limparBanco()
    ;({ periodoId } = await criarPeriodo())
    await importarTudo(periodoId)
    idA = await criarGestor()
    idB = await criarUsuario({ nome: 'Outro Gestor', ...OUTRO })
    app = criarApp()
    a = request.agent(app)
    b = request.agent(app)
    await a.post('/api/auth/login').send(GESTOR).expect(200)
    await b.post('/api/auth/login').send(OUTRO).expect(200)
    base = `/api/periodos/${periodoId}/versoes`
  })

  afterAll(async () => {
    await encerrarBanco()
  })

  const novoHorario = async (agente = a, nome = 'Proposta') =>
    (await agente.post(base).send({ nome }).expect(201)).body

  it('quem cria vira o editor, e todos os gestores veem quem é', async () => {
    const h = await novoHorario()
    expect(h.editor).toEqual({ id: idA, nome: 'Gestor de Teste' })
    const lista = (await b.get(base).expect(200)).body
    expect(lista[0].editor).toEqual({ id: idA, nome: 'Gestor de Teste' })
  })

  it('o outro gestor visualiza, mas não altera nada do horário', async () => {
    const h = await novoHorario()
    const v = `${base}/${h.id}`

    // Leitura e simulação continuam liberadas.
    await b.get(v).expect(200)
    await b.get(`${v}/aulas`).expect(200)
    await b.get(`${v}/avaliacao`).expect(200)
    await b.get(`${v}/edicao`).expect(200)
    await b.get(`${v}/atribuicoes`).expect(200)
    const atribuicao = await db('atribuicao').where({ versao_id: h.id }).first('id')
    await b.post(`${v}/edicao/simular`).send({ atribuicaoId: atribuicao.id }).expect(200)

    // Escritas: 403 com o nome do editor.
    const negado = await b.put(v).send({ nome: 'Outro nome' }).expect(403)
    expect(negado.body.erro).toContain('Gestor de Teste')
    expect(negado.body.detalhes.editor).toEqual({ id: idA, nome: 'Gestor de Teste' })
    await b.post(`${v}/publicar`).send({}).expect(403)
    await b.post(`${v}/despublicar`).expect(403)
    await b.delete(v).expect(403)
    await b.put(`${v}/atribuicoes/${atribuicao.id}`).send({}).expect(403)
    await b.delete(`${v}/atribuicoes/${atribuicao.id}`).expect(403)
    await b
      .post(`${v}/atribuicoes/excluir`)
      .send({ ids: [atribuicao.id] })
      .expect(403)
    await b.post(`${v}/edicao/posicionar`).send({ movimentos: [] }).expect(403)
    await b.post(`${v}/edicao/aulas`).send({}).expect(403)
    const professor = await db('professor').first('id')
    const disp = `/api/periodos/${periodoId}/disponibilidade/professor/${professor.id}`
    await b.put(`${disp}?versao=${h.id}`).send({ itens: [] }).expect(403)
    await b.post(`${disp}/usar-padrao?versao=${h.id}`).expect(403)
    await b
      .post(`/api/periodos/${periodoId}/geracao`)
      .send({ versaoId: h.id, tempoLimiteSegundos: 1 })
      .expect(403)

    // O padrão do período (sem ?versao) não é de nenhum horário.
    await b.put(disp).send({ itens: [] }).expect(200)

    // Nada mudou, e o editor continua podendo alterar.
    expect((await db('versao_grade').where({ id: h.id }).first()).nome).toBe('Proposta')
    await a.put(v).send({ nome: 'Renomeado' }).expect(200)
    await a.put(`${disp}?versao=${h.id}`).send({ itens: [] }).expect(200)
  })

  it('o outro gestor duplica e vira o editor da cópia', async () => {
    const h = await novoHorario()
    const copia = (
      await b.post(`${base}/${h.id}/duplicar`).send({ nome: 'Minha cópia' }).expect(201)
    ).body
    expect(copia.editor).toEqual({ id: idB, nome: 'Outro Gestor' })
    await b.put(`${base}/${copia.id}`).send({ nome: 'Cópia do outro' }).expect(200)
    await a.put(`${base}/${copia.id}`).send({ nome: 'Não pode' }).expect(403)

    const outra = (await b.post(base).send({ nome: 'Via copiarDe', copiarDe: h.id }).expect(201))
      .body
    expect(outra.editor.id).toBe(idB)
  })

  it('o editor transfere a edição para outro gestor', async () => {
    const h = await novoHorario()
    const v = `${base}/${h.id}`

    // Só o editor transfere.
    await b.post(`${v}/editor`).send({ usuarioId: idB }).expect(403)
    // Destino precisa ser gestor ativo, e não o próprio editor.
    await a.post(`${v}/editor`).send({ usuarioId: idA }).expect(400)
    await a.post(`${v}/editor`).send({ usuarioId: 9999 }).expect(400)
    const professor = await db('professor').first('id')
    const idProfessor = await criarUsuario({
      nome: 'Professor',
      email: 'prof@teste.local',
      senha: 'senha-do-prof',
      perfil: 'professor',
      professorId: professor.id,
    })
    await a.post(`${v}/editor`).send({ usuarioId: idProfessor }).expect(400)
    const idInativo = await criarUsuario({
      nome: 'Inativo',
      email: 'inativo@teste.local',
      senha: 'senha-inativo',
    })
    await db('usuario').where({ id: idInativo }).update({ ativo: false })
    await a.post(`${v}/editor`).send({ usuarioId: idInativo }).expect(400)

    const transferido = (await a.post(`${v}/editor`).send({ usuarioId: idB }).expect(200)).body
    expect(transferido.editor).toEqual({ id: idB, nome: 'Outro Gestor' })

    // Agora só B altera.
    await a.put(v).send({ nome: 'De A' }).expect(403)
    await b.put(v).send({ nome: 'De B' }).expect(200)
    // E B pode devolver.
    await b.post(`${v}/editor`).send({ usuarioId: idA }).expect(200)
    await a.put(v).send({ nome: 'De volta' }).expect(200)
  })

  it('horário sem editor fica só para leitura até um gestor assumir', async () => {
    const [id] = await db('versao_grade').insert({ periodo_id: periodoId, nome: 'Antigo' })
    const v = `${base}/${id}`
    expect((await a.get(v).expect(200)).body.editor).toBeNull()

    const negado = await a.put(v).send({ nome: 'X' }).expect(403)
    expect(negado.body.erro).toContain('sem editor')

    const assumido = (await a.post(`${v}/assumir`).expect(200)).body
    expect(assumido.editor.id).toBe(idA)
    await a.post(`${v}/assumir`).expect(200) // já é dele: nada muda
    await b.post(`${v}/assumir`).expect(403) // já tem editor
    await a.put(v).send({ nome: 'Assumido' }).expect(200)
  })

  it('com o editor desativado, outro gestor assume', async () => {
    const h = await novoHorario()
    await db('usuario').where({ id: idA }).update({ ativo: false })
    const v = `${base}/${h.id}`
    expect((await b.get(v).expect(200)).body.editor).toBeNull()
    await b.post(`${v}/assumir`).expect(200)
    await b.put(v).send({ nome: 'Agora é do B' }).expect(200)
  })

  it('excluir a conta do editor deixa o horário sem editor', async () => {
    const h = await novoHorario(b)
    await db('sessao').delete()
    await db('usuario').where({ id: idB }).delete()
    expect((await a.get(`${base}/${h.id}`).expect(200)).body.editor).toBeNull()
  })
})
