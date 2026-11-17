// Importação com banco (base horarios_test): prévia, gravação, reimportação e impacto.
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import request from 'supertest'
import { db, encerrarBanco } from '../src/db/knex.js'
import { criarApp } from '../src/app.js'
import { gerarPrevia, lerArquivos } from '../src/importacao/previa.js'
import { confirmarImportacao } from '../src/importacao/gravacao.js'
import { GESTOR, criarGestor, criarPeriodo, limparBanco } from './ajuda/banco.js'
import { CSV } from './ajuda/planilhas.js'

const arquivos = (nomes, substituir = {}) =>
  nomes.map((nome) => ({ nome, buffer: Buffer.from(substituir[nome] ?? CSV[nome], 'utf8') }))

const TODOS = ['atribuicoes.csv', 'turmas.csv', 'salas.csv', 'professores.csv', 'disciplinas.csv']

async function previa(periodoId, lista) {
  return gerarPrevia(db, periodoId, await lerArquivos(lista))
}

async function confirmar(periodoId, lista, usuarioId = null) {
  return confirmarImportacao({ periodoId, lidos: await lerArquivos(lista), usuarioId })
}

const contar = async (tabela) => Number((await db(tabela).count({ n: '*' }).first()).n)

const banco = inject('bancoDisponivel')

describe.skipIf(!banco)('importação com banco', () => {
  let periodo

  beforeEach(async () => {
    await limparBanco()
    periodo = await criarPeriodo()
  })

  afterAll(async () => {
    await encerrarBanco()
  })

  it('aceita os cinco arquivos em qualquer ordem e grava tudo', async () => {
    const p = await previa(periodo.periodoId, arquivos(TODOS))
    expect(p.podeConfirmar).toBe(true)
    expect(p.arquivos.map((a) => a.tipo)).toEqual([
      'salas',
      'professores',
      'disciplinas',
      'turmas',
      'atribuicoes',
    ])
    expect(p.arquivos.map((a) => a.resumo.criar)).toEqual([2, 2, 2, 2, 3])
    expect(p.arquivos.find((a) => a.tipo === 'turmas').linhas[0].avisos).toEqual([
      'Curso "Técnico em Informática" (integrado) será criado',
    ])

    const r = await confirmar(periodo.periodoId, arquivos(TODOS))
    expect(r.importacoes).toHaveLength(5)

    expect(await contar('sala')).toBe(2)
    expect(await contar('professor')).toBe(2)
    expect(await contar('disciplina')).toBe(2)
    expect(await contar('curso')).toBe(1)
    expect(await contar('turma')).toBe(2)
    expect(await contar('atribuicao')).toBe(3)
    expect(await contar('atribuicao_professor')).toBe(4)
    expect(await contar('importacao')).toBe(5)

    const lab = await db('sala').where({ nome: 'Lab. Informática' }).first()
    const prog = await db('disciplina').where({ sigla: 'PROG1' }).first()
    expect(lab.tipo).toBe('laboratorio de informatica')
    expect(prog.tipo_ambiente).toBe(lab.tipo)

    const turma = await db('turma').where({ codigo: 'INF1M' }).first()
    const turnos =
      typeof turma.turnos_permitidos === 'string'
        ? JSON.parse(turma.turnos_permitidos)
        : turma.turnos_permitidos
    expect(turnos).toEqual([periodo.turnos.Matutino])

    const bruno = await db('professor').where({ siape: '2222222' }).first()
    expect(bruno).toMatchObject({ email: null, carga_maxima_semanal: 16 })
  })

  it('reimportar os mesmos arquivos não duplica nada', async () => {
    await confirmar(periodo.periodoId, arquivos(TODOS))
    const p = await previa(periodo.periodoId, arquivos(TODOS))
    expect(p.arquivos.every((a) => a.resumo.inalterada === a.resumo.total)).toBe(true)
    expect(p.podeConfirmar).toBe(false)
    await expect(confirmar(periodo.periodoId, arquivos(TODOS))).rejects.toMatchObject({
      status: 400,
    })
    expect(await contar('professor')).toBe(2)
  })

  it('atualiza pela chave e lista o que muda', async () => {
    await confirmar(periodo.periodoId, arquivos(TODOS))
    const alterado = 'Nome;SIAPE;Carga máxima semanal\nAna Souza;1111111;12\nBruno Lima;2222222;\n'
    const p = await previa(
      periodo.periodoId,
      arquivos(['professores.csv'], { 'professores.csv': alterado })
    )
    const [ana, bruno] = p.arquivos[0].linhas
    expect(ana).toMatchObject({
      situacao: 'atualizar',
      mudancas: [{ campo: 'Carga máxima', de: 20, para: 12 }],
    })
    // Coluna de e-mail ausente e carga vazia mantêm o que já estava cadastrado.
    expect(bruno.situacao).toBe('inalterada')

    await confirmar(
      periodo.periodoId,
      arquivos(['professores.csv'], { 'professores.csv': alterado })
    )
    expect((await db('professor').where({ siape: '1111111' }).first()).carga_maxima_semanal).toBe(
      12
    )
    expect((await db('professor').where({ siape: '1111111' }).first()).email).toBe(
      'ana@ifma.edu.br'
    )
  })

  it('com qualquer linha rejeitada, não grava nem os arquivos válidos', async () => {
    const ruins =
      'Turma;Disciplina;Professores;Aulas semanais;Tamanho do bloco\n' +
      'INF9X;MAT1;1111111;4;2\n' +
      'INF1M;MAT1;9999999;2;3\n'
    const lista = arquivos(
      ['professores.csv', 'disciplinas.csv', 'turmas.csv', 'atribuicoes.csv'],
      {
        'atribuicoes.csv': ruins,
      }
    )

    const p = await previa(periodo.periodoId, lista)
    expect(p.podeConfirmar).toBe(false)
    const [l1, l2] = p.arquivos.find((a) => a.tipo === 'atribuicoes').linhas
    expect(l1.erros).toEqual([{ coluna: 'Turma', mensagem: 'Turma "INF9X" não existe no período' }])
    expect(l2.erros).toEqual([
      { coluna: 'Tamanho do bloco', mensagem: 'O bloco não pode ser maior que as aulas semanais' },
    ])

    await expect(confirmar(periodo.periodoId, lista)).rejects.toMatchObject({ status: 409 })
    expect(await contar('professor')).toBe(0)
    expect(await contar('importacao')).toBe(0)
  })

  it('rejeita chave repetida e turno inexistente', async () => {
    await confirmar(periodo.periodoId, arquivos(['professores.csv', 'disciplinas.csv']))
    const turmas =
      'Código;Curso;Nível;Turnos;Número de alunos\n' +
      'ADM1;Administração;subsequente;Noturno;40\n' +
      'adm1;Administração;subsequente;Noturno;40\n' +
      'ADM2;Administração;subsequente;Madrugada;40\n'
    const p = await previa(periodo.periodoId, arquivos(['turmas.csv'], { 'turmas.csv': turmas }))
    const [, repetida, semTurno] = p.arquivos[0].linhas
    expect(repetida.erros[0].mensagem).toBe('Chave repetida: já aparece na linha 2')
    expect(semTurno.erros[0].mensagem).toBe(
      'Turno "Madrugada" não existe no período (Matutino, Vespertino, Noturno)'
    )
  })

  it('recusa dois arquivos do mesmo tipo no mesmo envio', async () => {
    const lista = [
      ...arquivos(['salas.csv']),
      { nome: 'outras-salas.csv', buffer: Buffer.from(CSV['salas.csv']) },
    ]
    const p = await previa(periodo.periodoId, lista)
    expect(p.arquivos[1].erro).toMatch(/Já há um arquivo de salas neste envio/)
    expect(p.podeConfirmar).toBe(false)
  })

  it('marca para revisão as aulas de atribuição alterada (F1-19)', async () => {
    await confirmar(periodo.periodoId, arquivos(TODOS))
    const atribuicao = await db('atribuicao as a')
      .join('turma as t', 't.id', 'a.turma_id')
      .join('disciplina as d', 'd.id', 'a.disciplina_id')
      .where({ 't.codigo': 'INF1M', 'd.sigla': 'MAT1' })
      .first('a.id')
    const [versaoId] = await db('versao_grade').insert({
      periodo_id: periodo.periodoId,
      nome: 'Teste',
    })
    const horarios = await db('horario').where({ turno_id: periodo.turnos.Matutino }).limit(2)
    const sala = await db('sala').first('id')
    await db('aula').insert(
      horarios.map((h) => ({
        versao_id: versaoId,
        atribuicao_id: atribuicao.id,
        horario_id: h.id,
        sala_id: sala.id,
      }))
    )

    const novo = CSV['atribuicoes.csv'].replace('INF1M;MAT1;1111111;4;2', 'INF1M;MAT1;1111111;5;2')
    const lista = arquivos(['atribuicoes.csv'], { 'atribuicoes.csv': novo })
    const p = await previa(periodo.periodoId, lista)
    expect(p.impacto).toEqual({ aulas: 2, versoes: 1 })
    expect(p.arquivos[0].linhas[0]).toMatchObject({ situacao: 'atualizar', aulasParaRevisar: 2 })

    await confirmar(periodo.periodoId, lista)
    const aulas = await db('aula').where({ versao_id: versaoId })
    expect(aulas.map((a) => a.revisar)).toEqual([1, 1])
    expect(aulas).toHaveLength(2) // marcadas, não apagadas
  })

  describe('rotas HTTP', () => {
    const app = criarApp()

    async function entrar() {
      await criarGestor()
      const agente = request.agent(app)
      await agente.post('/api/auth/login').send(GESTOR).expect(200)
      return agente
    }

    const anexar = (req, nomes) =>
      nomes.reduce((r, nome) => r.attach('arquivos', Buffer.from(CSV[nome]), nome), req)

    it('exige login', async () => {
      await request(app).get(`/api/periodos/${periodo.periodoId}/importacoes`).expect(401)
    })

    it('faz prévia, confirma, lista o histórico e mostra o relatório', async () => {
      const agente = await entrar()
      const base = `/api/periodos/${periodo.periodoId}/importacoes`

      const previaRes = await anexar(agente.post(`${base}/previa`), TODOS).expect(200)
      expect(previaRes.body.podeConfirmar).toBe(true)
      expect(previaRes.body.aulasParaRevisar).toBeUndefined()
      expect(previaRes.body.arquivos[0].linhas[0].registro).toBeUndefined()

      const conf = await anexar(agente.post(base), TODOS).expect(201)
      expect(conf.body.importacoes).toHaveLength(5)

      const hist = await agente.get(base).expect(200)
      expect(hist.body).toHaveLength(5)
      expect(hist.body[0]).toMatchObject({ usuario: 'Gestor de Teste' })
      // Data gravada em UTC e lida como o mesmo instante (sem deslocamento de fuso).
      expect(Math.abs(new Date(hist.body[0].criadoEm) - Date.now())).toBeLessThan(2 * 60 * 1000)

      const det = await agente.get(`${base}/${hist.body[0].id}`).expect(200)
      expect(det.body.relatorio.linhas.length).toBeGreaterThan(0)
    })

    it('devolve 409 com o relatório quando há linha rejeitada', async () => {
      const agente = await entrar()
      const res = await agente
        .post(`/api/periodos/${periodo.periodoId}/importacoes`)
        .attach('arquivos', Buffer.from(CSV['atribuicoes.csv']), 'atribuicoes.csv')
        .expect(409)
      expect(res.body.detalhes.arquivos[0].resumo.rejeitar).toBe(3)
    })

    it('baixa a planilha-modelo e recusa tipo desconhecido', async () => {
      const agente = await entrar()
      const res = await agente.get('/api/importacoes/modelos/turmas').expect(200)
      expect(res.headers['content-type']).toContain('spreadsheetml')
      expect(res.headers['content-disposition']).toContain('modelo-turmas.xlsx')
      await agente.get('/api/importacoes/modelos/notas').expect(400)
    })

    it('recusa envio sem arquivo e período inexistente', async () => {
      const agente = await entrar()
      await agente.post(`/api/periodos/${periodo.periodoId}/importacoes/previa`).expect(400)
      await anexar(agente.post('/api/periodos/999/importacoes/previa'), ['salas.csv']).expect(404)
    })
  })
})
