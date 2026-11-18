// Fase 3 — Restrições por período, geração em worker, versões, avaliação e painel.
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import request from 'supertest'
import { criarApp } from '../src/app.js'
import { db, encerrarBanco } from '../src/db/knex.js'
import { Gerenciador, gerenciador } from '../src/geracao/gerenciador.js'
import { montarProblema } from '../src/servicos/problema.js'
import { criarVersao, gravarSolucao } from '../src/servicos/versoes.js'
import { GESTOR, criarGestor, criarPeriodo, limparBanco } from './ajuda/banco.js'
import { importarTudo } from './ajuda/planilhas.js'

const banco = inject('bancoDisponivel')

// Espera o job do período chegar a um estado que satisfaça a condição.
function esperar(g, periodoId, condicao, limiteMs = 20_000) {
  return new Promise((resolver, rejeitar) => {
    const atual = g.obter(periodoId)
    if (atual && condicao(atual)) return resolver(atual)
    const tempo = setTimeout(() => {
      sair()
      rejeitar(new Error(`Tempo esgotado; estado ${g.obter(periodoId)?.estado}`))
    }, limiteMs)
    const sair = g.assinar(periodoId, (job) => {
      if (!condicao(job)) return
      clearTimeout(tempo)
      sair()
      resolver(job)
    })
  })
}

const terminou = (j) => !j.ativo

describe.skipIf(!banco)('geração na interface (API)', () => {
  let periodoId
  let agente
  let app
  let gestorId // editor dos horários criados nos testes

  beforeEach(async () => {
    await limparBanco()
    ;({ periodoId } = await criarPeriodo())
    await importarTudo(periodoId)
    gestorId = await criarGestor()
    app = criarApp()
    agente = request.agent(app)
    await agente.post('/api/auth/login').send(GESTOR).expect(200)
  })

  afterAll(async () => {
    await gerenciador.encerrar()
    await encerrarBanco()
  })

  describe('restrições do período (F3-01)', () => {
    const base = () => `/api/periodos/${periodoId}/restricoes`

    it('cria as linhas que faltam com os valores do catálogo', async () => {
      const { body } = await agente.get(base()).expect(200)
      expect(body).toHaveLength(18)
      expect(body.find((r) => r.codigo === 'R1')).toMatchObject({ ativa: true, peso: null })
      expect(body.find((r) => r.codigo === 'F4')).toMatchObject({
        peso: 7,
        parametros: { maximoPorDia: 2 },
      })
      expect(await db('restricao_config').where({ periodo_id: periodoId })).toHaveLength(18)
    })

    it('altera peso, ativação e parâmetros, e o problema reflete', async () => {
      await agente.put(`${base()}/F2`).send({ peso: 3 }).expect(200)
      await agente.put(`${base()}/f7`).send({ ativa: false }).expect(200)
      const { body } = await agente
        .put(`${base()}/F4`)
        .send({ parametros: { maximoPorDia: 3 } })
        .expect(200)
      expect(body.parametros).toEqual({ maximoPorDia: 3 })
      const { problema } = await montarProblema(periodoId)
      const por = Object.fromEntries(problema.restricoes.map((r) => [r.codigo, r]))
      expect(por.F2.peso).toBe(3)
      expect(por.F7.ativa).toBe(false)
      expect(por.F4.parametros).toEqual({ maximoPorDia: 3 })
    })

    it('recusa peso em rígida, parâmetro inválido e turno de outro período', async () => {
      await agente.put(`${base()}/R1`).send({ peso: 5 }).expect(400)
      const { body } = await agente
        .put(`${base()}/F4`)
        .send({ parametros: { maximoPorDia: 0 } })
        .expect(400)
      expect(body.detalhes[0].campo).toBe('parametros.maximoPorDia')
      await agente
        .put(`${base()}/F2`)
        .send({ parametros: { x: 1 } })
        .expect(400)
      await agente.put(`${base()}/F2`).send({ peso: 11 }).expect(400)
      await agente
        .put(`${base()}/F3`)
        .send({ parametros: { turnoNoite: 9999 } })
        .expect(400)
      await agente.put(`${base()}/X1`).send({ ativa: false }).expect(404)
    })

    it('restaura os valores do catálogo', async () => {
      await agente.put(`${base()}/F2`).send({ peso: 1, ativa: false }).expect(200)
      const { body } = await agente.post(`${base()}/restaurar`).expect(200)
      expect(body.find((r) => r.codigo === 'F2')).toMatchObject({ peso: 9, ativa: true })
    })
  })

  describe('geração em worker (F3-03 a F3-05)', () => {
    it('gera, informa o progresso e grava a versão', async () => {
      const g = new Gerenciador()
      const eventos = []
      g.assinar(periodoId, (j) => eventos.push(j.estado))
      const horario = await criarVersao(periodoId, { nome: 'Primeira' }, gestorId)
      expect(horario).toMatchObject({ totalAtribuicoes: 3, totalAulas: 0, origem: 'manual' })
      await g.iniciar(periodoId, { versaoId: horario.id, tempoLimiteSegundos: 1, semente: 'teste' })
      const job = await esperar(g, periodoId, terminou)

      expect(job.estado).toBe('concluido')
      expect(eventos).toEqual(
        expect.arrayContaining(['preparando', 'executando', 'gravando', 'concluido'])
      )
      expect(job.construcao.blocos).toBeGreaterThan(0)
      expect(job.progresso.etapa).toBe('melhoria')
      const { versao } = job.resultado
      expect(versao).toMatchObject({
        nome: 'Primeira',
        origem: 'solver',
        semente: 'teste',
        totalAulas: 12,
      })
      // O laboratório (20) não comporta a INF1M (35): 4 aulas violam R7.
      expect(job.resultado.custoRigido).toBe(4)
      expect(versao.detalhes.tempoLimiteSegundos).toBe(1)
    })

    it('recusa uma segunda geração no mesmo período e cancela descartando', async () => {
      const g = new Gerenciador()
      const horario = await criarVersao(periodoId, { nome: 'H' }, gestorId)
      await g.iniciar(periodoId, { versaoId: horario.id, tempoLimiteSegundos: 60 })
      await expect(g.iniciar(periodoId, { versaoId: horario.id })).rejects.toThrow(
        'Já existe uma geração em andamento'
      )
      await esperar(g, periodoId, (j) => j.estado === 'executando' && j.progresso)
      g.cancelar(periodoId)
      const job = await esperar(g, periodoId, terminou)
      expect(job.estado).toBe('cancelado')
      expect(await db('aula').count({ n: '*' }).first()).toEqual({ n: 0 })
      expect(() => g.cancelar(periodoId)).toThrow('Não há geração em andamento')
    })

    it('ao encerrar com "salvar", grava a melhor solução até ali', async () => {
      const g = new Gerenciador()
      const horario = await criarVersao(periodoId, { nome: 'H' }, gestorId)
      await g.iniciar(periodoId, { versaoId: horario.id, tempoLimiteSegundos: 60 })
      await esperar(g, periodoId, (j) => j.estado === 'executando' && j.progresso)
      g.cancelar(periodoId, { salvar: true })
      const job = await esperar(g, periodoId, terminou)
      expect(job.estado).toBe('concluido')
      expect(job.resultado.motivoFim).toBe('cancelado')
      expect(job.resultado.versao.detalhes.cancelada).toBe(true)
      expect(job.decorridoMs).toBeLessThan(30_000)
    })

    it('termina com erro quando o horário não tem o que gerar', async () => {
      const vazio = await criarPeriodo('2027.2')
      const g = new Gerenciador()
      const horario = await criarVersao(vazio.periodoId, { nome: 'Vazio' }, gestorId)
      await g.iniciar(vazio.periodoId, { versaoId: horario.id })
      const job = await esperar(g, vazio.periodoId, terminou)
      expect(job.estado).toBe('erro')
      expect(job.erro.mensagem).toMatch(/não tem atribuições/)
    })

    it('expõe início, estado e cancelamento pela API', async () => {
      const base = `/api/periodos/${periodoId}/geracao`
      expect((await agente.get(base).expect(200)).body.job).toBeNull()
      const horario = await criarVersao(periodoId, { nome: 'Pela API' }, gestorId)
      await agente.post(base).send({ versaoId: horario.id, tempoLimiteSegundos: 0 }).expect(400)
      await agente.post(base).send({ tempoLimiteSegundos: 30 }).expect(400)
      await agente.post(base).send({ versaoId: 9999 }).expect(404)
      const { body } = await agente
        .post(base)
        .send({ versaoId: horario.id, tempoLimiteSegundos: 30 })
        .expect(202)
      expect(body.job).toMatchObject({ ativo: true, nome: 'Pela API' })
      await agente.post(base).send({ versaoId: horario.id }).expect(409)
      await agente.post(`${base}/cancelar`).send({}).expect(200)
      const job = await esperar(gerenciador, periodoId, terminou)
      expect(job.estado).toBe('cancelado')
      await request(app).get(base).expect(401)
    })

    it('envia o estado do job por Server-Sent Events', async () => {
      const servidor = app.listen(0)
      try {
        const porta = servidor.address().port
        const login = await fetch(`http://127.0.0.1:${porta}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(GESTOR),
        })
        const cookie = login.headers.get('set-cookie').split(';')[0]
        const controle = new AbortController()
        const resposta = await fetch(
          `http://127.0.0.1:${porta}/api/periodos/${periodoId}/geracao/eventos`,
          {
            headers: { cookie },
            signal: controle.signal,
          }
        )
        expect(resposta.headers.get('content-type')).toMatch(/text\/event-stream/)
        const leitor = resposta.body.getReader()
        const { value } = await leitor.read()
        // Sem geração no período desta conexão nova, o primeiro evento traz o último job (ou null).
        const texto = new TextDecoder().decode(value)
        expect(texto.startsWith('event: job\ndata: ')).toBe(true)
        expect(JSON.parse(texto.slice(texto.indexOf('{')))).toHaveProperty('job')
        controle.abort()
      } finally {
        servidor.closeAllConnections()
        servidor.close()
      }
    })
  })

  describe('versões e avaliação (F3-08, F3-10)', () => {
    async function gerar(nome = 'V1') {
      const g = new Gerenciador()
      const horario = await criarVersao(periodoId, { nome }, gestorId)
      await g.iniciar(periodoId, { versaoId: horario.id, tempoLimiteSegundos: 1, semente: 'v' })
      return (await esperar(g, periodoId, terminou)).resultado.versao
    }

    it('lista, mostra as aulas e avalia a versão com as regras atuais', async () => {
      const versao = await gerar()
      const base = `/api/periodos/${periodoId}/versoes`
      const lista = (await agente.get(base).expect(200)).body
      expect(lista.map((v) => v.nome)).toEqual(['V1'])

      const aulas = (await agente.get(`${base}/${versao.id}/aulas`).expect(200)).body
      expect(aulas).toHaveLength(12)
      const prog = aulas.find((a) => a.sigla === 'PROG1')
      expect(prog.professores.map((p) => p.nome)).toEqual(['Ana Souza', 'Bruno Lima'])
      expect(prog.sala).toBe('Lab. Informática')

      const avaliacao = (await agente.get(`${base}/${versao.id}/avaliacao`).expect(200)).body
      expect(avaliacao.custoRigido).toBe(4)
      expect(avaliacao.pontuacao).toBe(versao.pontuacao)
      const r7 = avaliacao.violacoes.filter((v) => v.codigo === 'R7')
      expect(r7).toHaveLength(4)
      // Violações apontam aulas pelo id do banco.
      expect(aulas.map((a) => a.id)).toEqual(expect.arrayContaining(r7.flatMap((v) => v.aulas)))
    })

    it('renomeia, duplica e exclui; a publicada não pode ser excluída', async () => {
      const versao = await gerar()
      const base = `/api/periodos/${periodoId}/versoes`
      await agente.put(`${base}/${versao.id}`).send({ nome: '' }).expect(400)
      expect((await agente.put(`${base}/${versao.id}`).send({ nome: 'Oficial' })).body.nome).toBe(
        'Oficial'
      )
      const copia = (await agente.post(`${base}/${versao.id}/duplicar`).send({}).expect(201)).body
      expect(copia).toMatchObject({
        nome: 'Oficial (cópia)',
        origem: 'manual',
        totalAulas: 12,
        totalAtribuicoes: 3,
      })
      expect(copia.detalhes.copiaDe).toBe(versao.id)
      // As aulas da cópia apontam para as atribuições da própria cópia.
      const fora = await db('aula as au')
        .join('atribuicao as a', 'a.id', 'au.atribuicao_id')
        .where('au.versao_id', copia.id)
        .whereNot('a.versao_id', copia.id)
        .count({ n: '*' })
        .first()
      expect(fora).toEqual({ n: 0 })

      await agente.delete(`${base}/${copia.id}`).expect(204)
      await db('versao_grade').where({ id: versao.id }).update({ publicada: true })
      await agente.delete(`${base}/${versao.id}`).expect(409)
      await agente.get(`${base}/9999`).expect(404)
    })

    it('grava sem sala a aula que repetiria sala e horário', async () => {
      const horario = await criarVersao(periodoId, { nome: 'Choque' }, gestorId)
      const [a] = await db('atribuicao').where({ versao_id: horario.id }).limit(1)
      const [h] = await db('horario').where({ periodo_id: periodoId }).limit(1)
      const [s] = await db('sala').limit(1)
      const aula = { atribuicaoId: a.id, horarioId: h.id, salaId: s.id, fixada: false }
      const versao = await gravarSolucao(periodoId, horario.id, {
        aulas: [aula, aula],
        semente: '1',
        pontuacao: 0,
        custoRigido: 2,
        pontuacaoPorRestricao: {},
        naoAlocados: [],
        iteracoes: 0,
        tempoMs: 0,
      })
      expect(versao.detalhes.aulasSemSalaAoGravar).toBe(1)
      expect(await db('aula').where({ versao_id: versao.id }).whereNull('sala_id')).toHaveLength(1)
    })
  })

  describe('horários com atribuições próprias', () => {
    const base = () => `/api/periodos/${periodoId}/versoes`
    const daOferta = (turma, sigla) =>
      db('atribuicao as a')
        .join('turma as t', 't.id', 'a.turma_id')
        .join('disciplina as d', 'd.id', 'a.disciplina_id')
        .where({ 't.codigo': turma, 'd.sigla': sigla })
        .whereNull('a.versao_id')
        .first('a.*')

    it('cria o horário com cópia da oferta e edita só nele', async () => {
      const horario = (await agente.post(base()).send({ nome: 'Proposta A' }).expect(201)).body
      expect(horario).toMatchObject({ nome: 'Proposta A', totalAtribuicoes: 3, totalAulas: 0 })
      await agente.post(base()).send({ nome: '' }).expect(400)

      const url = `${base()}/${horario.id}/atribuicoes`
      const { body } = await agente.get(url).expect(200)
      expect(body.atribuicoes).toHaveLength(3)
      expect(body.atribuicoes.every((a) => a.diferencas.length === 0)).toBe(true)
      expect(body.foraDoHorario).toEqual([])

      // Troca o professor de MAT1 na INF1M só neste horário.
      const mat = body.atribuicoes.find((a) => a.turma === 'INF1M' && a.disciplina === 'MAT1')
      const bruno = await db('professor').where({ siape: '2222222' }).first()
      const editada = (
        await agente
          .put(`${url}/${mat.id}`)
          .send({ professores: [bruno.id], aulasSemanais: 3, tamanhoBloco: 1, grupoParalelo: '' })
          .expect(200)
      ).body
      expect(editada.registro.professoresDetalhe.map((p) => p.nome)).toEqual(['Bruno Lima'])
      const oferta = await daOferta('INF1M', 'MAT1')
      expect(oferta.aulas_semanais).toBe(4)
      const depois = (await agente.get(url)).body.atribuicoes.find((a) => a.id === mat.id)
      expect(depois.diferencas).toEqual(['aulas', 'bloco', 'professores'])

      // O solver usa as atribuições do horário: 3 aulas de MAT1, com o Bruno.
      const g = new Gerenciador()
      await g.iniciar(periodoId, { versaoId: horario.id, tempoLimiteSegundos: 1, semente: 'h' })
      await esperar(g, periodoId, terminou)
      const aulas = (await agente.get(`${base()}/${horario.id}/aulas`)).body
      const deMat = aulas.filter((a) => a.atribuicaoId === mat.id)
      expect(deMat).toHaveLength(3)
      expect(deMat[0].professores.map((p) => p.nome)).toEqual(['Bruno Lima'])

      // Restaurar volta ao que está na oferta.
      const restaurada = (await agente.post(`${url}/${mat.id}/restaurar`).expect(200)).body
      expect(restaurada.registro).toMatchObject({ aulasSemanais: 4, tamanhoBloco: 2 })
    })

    it('tira e devolve disciplinas do horário e copia de outro horário', async () => {
      const a = (await agente.post(base()).send({ nome: 'A' }).expect(201)).body
      const url = `${base()}/${a.id}/atribuicoes`
      const lista = (await agente.get(url)).body.atribuicoes
      const prog = lista.find((x) => x.disciplina === 'PROG1')
      const removida = (await agente.delete(`${url}/${prog.id}`).expect(200)).body
      expect(removida.aulasRemovidas).toBe(0)
      const fora = (await agente.get(url)).body.foraDoHorario
      expect(fora.map((x) => x.disciplina)).toEqual(['PROG1'])
      await agente
        .post(`${url}/adicionar`)
        .send({ ids: [fora[0].id] })
        .expect(201)
      await agente
        .post(`${url}/adicionar`)
        .send({ ids: [fora[0].id] })
        .expect(409)
      expect((await agente.get(url)).body.atribuicoes).toHaveLength(3)

      // Cópia de outro horário leva as atribuições daquele horário, não as da oferta.
      await agente.delete(`${url}/${(await agente.get(url)).body.atribuicoes[0].id}`).expect(200)
      const b = (await agente.post(base()).send({ nome: 'B', copiarDe: a.id }).expect(201)).body
      expect(b).toMatchObject({ nome: 'B', totalAtribuicoes: 2 })

      // Horário publicado não muda.
      await db('versao_grade').where({ id: a.id }).update({ publicada: true })
      const resto = (await agente.get(url)).body.atribuicoes[0]
      await agente.delete(`${url}/${resto.id}`).expect(409)
      await agente
        .post('/api/periodos/' + periodoId + '/geracao')
        .send({ versaoId: a.id })
        .expect(409)
    })

    it('cria atribuição nova só no horário, para uma turma nova, e gera com ela', async () => {
      const a = (await agente.post(base()).send({ nome: 'A' }).expect(201)).body
      const b = (await agente.post(base()).send({ nome: 'B' }).expect(201)).body
      const turma = (
        await agente
          .post(`/api/periodos/${periodoId}/dados/turmas`)
          .send({
            codigo: 'INF2N',
            curso: 'Técnico em Informática',
            nivel: 'subsequente',
            turnos: [
              (await db('turno').where({ periodo_id: periodoId, nome: 'Noturno' }).first()).id,
            ],
            numeroAlunos: 20,
          })
          .expect(201)
      ).body.registro
      const mat = await db('disciplina').where({ sigla: 'MAT1' }).first()
      const bruno = await db('professor').where({ siape: '2222222' }).first()
      const url = `${base()}/${a.id}/atribuicoes`
      const nova = {
        turmaId: turma.id,
        disciplinaId: mat.id,
        professores: [bruno.id],
        aulasSemanais: 2,
        tamanhoBloco: 2,
        grupoParalelo: '',
      }
      const criada = (await agente.post(url).send(nova).expect(201)).body.registro
      expect(criada).toMatchObject({ turma: 'INF2N', disciplina: 'MAT1', aulasSemanais: 2 })
      await agente.post(url).send(nova).expect(409)
      await agente
        .post(url)
        .send({ ...nova, turmaId: undefined })
        .expect(400)

      const lista = (await agente.get(url)).body.atribuicoes
      expect(lista.find((x) => x.id === criada.id)).toMatchObject({
        naOferta: null,
        diferencas: [],
      })
      // Só no horário A: o B e a oferta não têm a atribuição.
      const deB = (await agente.get(`${base()}/${b.id}/atribuicoes`)).body.atribuicoes
      expect(deB.some((x) => x.turma === 'INF2N')).toBe(false)
      expect(await daOferta('INF2N', 'MAT1')).toBeUndefined()

      const g = new Gerenciador()
      await g.iniciar(periodoId, { versaoId: a.id, tempoLimiteSegundos: 1, semente: 't' })
      await esperar(g, periodoId, terminou)
      const aulas = (await agente.get(`${base()}/${a.id}/aulas`)).body
      expect(aulas.filter((x) => x.turma === 'INF2N')).toHaveLength(2)
    })

    it('a oferta reimportada não mexe nos horários existentes', async () => {
      const a = (await agente.post(base()).send({ nome: 'A' }).expect(201)).body
      await db('atribuicao')
        .where({ id: (await daOferta('INF1M', 'MAT1')).id })
        .update({ aulas_semanais: 2 })
      const lista = (await agente.get(`${base()}/${a.id}/atribuicoes`)).body.atribuicoes
      const mat = lista.find((x) => x.turma === 'INF1M' && x.disciplina === 'MAT1')
      expect(mat.aulasSemanais).toBe(4)
      expect(mat.diferencas).toEqual(['aulas'])
    })
  })

  describe('painel do período (F3-11)', () => {
    it('resume os dados e aponta as pendências que impedem uma grade válida', async () => {
      const { body } = await agente.get(`/api/periodos/${periodoId}/painel`).expect(200)
      expect(body.dados).toMatchObject({
        turmas: 2,
        professores: 2,
        atribuicoes: 3,
        aulasSemanais: 12,
        horarios: 30,
      })
      expect(body.dados.ultimaImportacao).toBeTruthy()
      const mensagens = body.pendencias.map((p) => p.mensagem)
      expect(mensagens).toEqual([
        'Atribuições sem sala compatível em tipo e capacidade: INF1M · PROG1 (laboratorio de informatica, 35 alunos). Divida a turma em grupos paralelos ou ajuste as salas.',
      ])
      expect(body.versoes.total).toBe(0)
    })
  })
})
