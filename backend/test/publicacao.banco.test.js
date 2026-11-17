// Fase 5 — Publicação, consulta pública, exportações, disponibilidade, contas e sessões.
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import request from 'supertest'
import ExcelJS from 'exceljs'
import { criarApp } from '../src/app.js'
import { db, encerrarBanco } from '../src/db/knex.js'
import { ArmazemDeSessoes } from '../src/db/sessoes.js'
import { Gerenciador } from '../src/geracao/gerenciador.js'
import { criarVersao } from '../src/servicos/versoes.js'
import { GESTOR, criarGestor, criarPeriodo, limparBanco } from './ajuda/banco.js'
import { importarTudo } from './ajuda/planilhas.js'

const banco = inject('bancoDisponivel')
let gestorId // editor dos horários criados nos testes

// Gera uma versão (1 s) e devolve o id.
async function gerarVersao(periodoId, nome) {
  const g = new Gerenciador()
  const horario = await criarVersao(periodoId, { nome }, gestorId)
  return new Promise((resolver, rejeitar) => {
    const sair = g.assinar(periodoId, (job) => {
      if (job.ativo) return
      sair()
      if (job.estado === 'concluido') resolver(job.resultado.versao.id)
      else rejeitar(new Error(job.erro?.mensagem ?? job.estado))
    })
    g.iniciar(periodoId, { versaoId: horario.id, tempoLimiteSegundos: 1, semente: 'pub' }).catch(
      rejeitar
    )
  })
}

// supertest não converte PDF/XLSX: junta os bytes.
const binario = (res, cb) => {
  const partes = []
  res.on('data', (p) => partes.push(p))
  res.on('end', () => cb(null, Buffer.concat(partes)))
}

describe.skipIf(!banco)('publicação e consulta (Fase 5)', () => {
  let periodoId
  let gestor
  let app

  beforeEach(async () => {
    await limparBanco()
    ;({ periodoId } = await criarPeriodo())
    await importarTudo(periodoId)
    gestorId = await criarGestor()
    app = criarApp()
    gestor = request.agent(app)
    await gestor.post('/api/auth/login').send(GESTOR).expect(200)
  })

  afterAll(async () => {
    await encerrarBanco()
  })

  describe('publicação (F5-01)', () => {
    it('pede confirmação para versão inválida e mantém uma só publicada', async () => {
      const v1 = await gerarVersao(periodoId, 'V1') // laboratório pequeno: R7
      const base = `/api/periodos/${periodoId}/versoes`
      const recusa = await gestor.post(`${base}/${v1}/publicar`).send({}).expect(409)
      expect(recusa.body.detalhes).toMatchObject({ custoRigido: 4, exigeConfirmacao: true })

      const publicada = (
        await gestor.post(`${base}/${v1}/publicar`).send({ forcar: true }).expect(200)
      ).body
      expect(publicada).toMatchObject({ publicada: true })
      expect(publicada.publicadaEm).toBeTruthy()
      expect((await db('periodo_letivo').where({ id: periodoId }).first()).situacao).toBe(
        'publicado'
      )

      // Com o laboratório maior, a nova versão é válida e assume a publicação.
      await db('sala').where({ nome: 'Lab. Informática' }).update({ capacidade: 40 })
      const v2 = await gerarVersao(periodoId, 'V2')
      await gestor.post(`${base}/${v2}/publicar`).send({}).expect(200)
      const lista = (await gestor.get(base)).body
      expect(lista.filter((v) => v.publicada).map((v) => v.id)).toEqual([v2])

      await gestor.post(`${base}/${v1}/despublicar`).expect(409)
      await gestor.post(`${base}/${v2}/despublicar`).expect(200)
      expect((await db('periodo_letivo').where({ id: periodoId }).first()).situacao).toBe(
        'planejamento'
      )
    })
  })

  describe('consulta pública (F5-06)', () => {
    it('mostra só períodos publicados, sem dados internos e sem login', async () => {
      const anonimo = request(app)
      expect((await anonimo.get('/api/publico/periodos').expect(200)).body).toEqual([])
      await anonimo.get(`/api/publico/periodos/${periodoId}`).expect(404)

      const v = await gerarVersao(periodoId, 'Oficial')
      await gestor.post(`/api/periodos/${periodoId}/versoes/${v}/publicar`).send({ forcar: true })

      const periodos = (await anonimo.get('/api/publico/periodos').expect(200)).body
      expect(periodos).toMatchObject([{ id: periodoId, nome: '2027.1', versao: 'Oficial' }])
      const { body } = await anonimo.get(`/api/publico/periodos/${periodoId}`).expect(200)
      expect(body.aulas).toHaveLength(12)
      expect(body.recursos.turma.map((t) => t.nome)).toEqual(['INF1M', 'INF1V'])
      const texto = JSON.stringify(body)
      expect(texto).not.toMatch(/siape|email|1111111|ana@ifma/i)

      const turma = body.recursos.turma[0].id
      const pdf = await anonimo
        .get(`/api/publico/periodos/${periodoId}/pdf?tipo=turma&recurso=${turma}`)
        .buffer()
        .parse(binario)
        .expect(200)
      expect(pdf.headers['content-type']).toBe('application/pdf')
      expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-')
    })
  })

  describe('exportações (F5-02 a F5-04)', () => {
    it('gera PDF por tipo, consolidado e XLSX com uma linha por aula', async () => {
      const v = await gerarVersao(periodoId, 'Exportar')
      const base = `/api/periodos/${periodoId}/versoes/${v}/exportar`
      for (const tipo of ['turma', 'professor', 'sala', 'campus']) {
        const r = await gestor.get(`${base}/pdf?tipo=${tipo}`).buffer().parse(binario).expect(200)
        expect(r.body.subarray(0, 5).toString()).toBe('%PDF-')
        expect(r.headers['content-disposition']).toContain(`horario-2027.1-`)
      }
      const campus = await gestor.get(`${base}/pdf?tipo=campus`).buffer().parse(binario)
      // Capa + 2 turmas + 2 professores + 2 salas = 7 páginas.
      expect(campus.body.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(7)
      await gestor.get(`${base}/pdf?tipo=tudo`).expect(400)
      await gestor.get(`${base}/pdf?tipo=turma&recurso=99999`).expect(404)

      // Turma de um turno sai em paisagem; com dois turnos, em retrato.
      const paginas = async (consulta) => {
        const r = await gestor.get(`${base}/pdf?${consulta}`).buffer().parse(binario).expect(200)
        const texto = r.body.toString('latin1')
        return {
          retrato: (texto.match(/MediaBox \[0 0 595\.28 841\.89\]/g) ?? []).length,
          paisagem: (texto.match(/MediaBox \[0 0 841\.89 595\.28\]/g) ?? []).length,
        }
      }
      expect(await paginas('tipo=turma')).toEqual({ retrato: 0, paisagem: 2 })
      const turma = await db('turma').where({ periodo_id: periodoId, codigo: 'INF1M' }).first()
      const turnos = await db('turno').where({ periodo_id: periodoId }).pluck('id')
      await db('turma')
        .where({ id: turma.id })
        .update({ turnos_permitidos: JSON.stringify(turnos.slice(0, 2)) })
      expect(await paginas(`tipo=turma&recurso=${turma.id}`)).toEqual({ retrato: 1, paisagem: 0 })
      expect(await paginas('tipo=campus')).toMatchObject({ retrato: 1 })

      const xlsx = await gestor.get(`${base}/xlsx`).buffer().parse(binario).expect(200)
      const livro = new ExcelJS.Workbook()
      await livro.xlsx.load(xlsx.body)
      const aulas = livro.getWorksheet('Aulas')
      expect(aulas.rowCount).toBe(13)
      expect(aulas.getRow(1).values.slice(1, 6)).toEqual([
        'Turma',
        'Sigla',
        'Disciplina',
        'Professores',
        'SIAPE',
      ])
      const prog = aulas.getRows(2, 12).find((r) => r.getCell(2).value === 'PROG1')
      expect(prog.getCell(5).value).toBe('1111111; 2222222')

      await request(app).get(`${base}/xlsx`).expect(401)
    })
  })

  describe('disponibilidade e conta de professor (F5-07, F5-08)', () => {
    async function contaDeProfessor(siape, email) {
      const professor = await db('professor').where({ siape }).first()
      await gestor
        .post('/api/usuarios')
        .send({
          nome: professor.nome,
          email,
          perfil: 'professor',
          professorId: professor.id,
          senha: 'senha-prof-1',
        })
        .expect(201)
      const agente = request.agent(app)
      await agente.post('/api/auth/login').send({ email, senha: 'senha-prof-1' }).expect(200)
      return { agente, professor }
    }

    it('gestor marca qualquer recurso; professor só a si mesmo', async () => {
      const horarios = await db('horario').where({ periodo_id: periodoId }).orderBy('id').limit(3)
      const ana = await db('professor').where({ siape: '1111111' }).first()
      const base = `/api/periodos/${periodoId}/disponibilidade`
      const itens = [
        { horarioId: horarios[0].id, rigida: true, motivo: 'Outro campus' },
        { horarioId: horarios[1].id, rigida: false },
      ]
      const { body } = await gestor.put(`${base}/professor/${ana.id}`).send({ itens }).expect(200)
      expect(body.itens).toHaveLength(2)
      expect(body.recurso.nome).toBe('Ana Souza')

      const resumo = (await gestor.get(`${base}/professores`).expect(200)).body
      expect(resumo.find((p) => p.id === ana.id)).toMatchObject({
        indisponiveis: 1,
        preferencias: 1,
        temConta: false,
      })

      const turma = await db('turma').where({ codigo: 'INF1M' }).first()
      await gestor
        .put(`${base}/turma/${turma.id}`)
        .send({ itens: [{ horarioId: horarios[0].id, rigida: false }] })
        .expect(400)

      const { agente: bruno, professor } = await contaDeProfessor('2222222', 'bruno@teste.local')
      await bruno.get(`${base}/professor/${ana.id}`).expect(403)
      await bruno
        .put(`${base}/professor/${professor.id}`)
        .send({ itens: [{ horarioId: horarios[2].id, rigida: true }] })
        .expect(200)
      expect((await bruno.get(`${base}/professores`)).body.map((p) => p.nome)).toEqual([
        'Bruno Lima',
      ])
      await bruno.get('/api/usuarios').expect(403)

      const outro = await criarPeriodo('2027.2')
      const alheio = await db('horario').where({ periodo_id: outro.periodoId }).first()
      await gestor
        .put(`${base}/professor/${ana.id}`)
        .send({ itens: [{ horarioId: alheio.id, rigida: true }] })
        .expect(400)
    })

    it('controla contas: e-mail e professor únicos, auto-proteção e troca de senha', async () => {
      const ana = await db('professor').where({ siape: '1111111' }).first()
      const nova = {
        nome: 'Ana',
        email: 'ana@teste.local',
        perfil: 'professor',
        professorId: ana.id,
        senha: 'senha-ana-1',
      }
      await gestor
        .post('/api/usuarios')
        .send({ ...nova, professorId: null })
        .expect(400)
      await gestor
        .post('/api/usuarios')
        .send({ ...nova, senha: 'curta' })
        .expect(400)
      const criada = (await gestor.post('/api/usuarios').send(nova).expect(201)).body
      expect(criada).toMatchObject({ perfil: 'professor', professor: 'Ana Souza', ativo: true })
      await gestor
        .post('/api/usuarios')
        .send({ ...nova, email: 'outra@teste.local' })
        .expect(409)
      await gestor
        .post('/api/usuarios')
        .send({ ...nova, email: GESTOR.email })
        .expect(409)

      const eu = (await gestor.get('/api/auth/eu')).body.usuario
      await gestor.put(`/api/usuarios/${eu.id}`).send({ ativo: false }).expect(409)
      await gestor.put(`/api/usuarios/${eu.id}`).send({ perfil: 'professor' }).expect(409)

      await gestor
        .put('/api/auth/senha')
        .send({ senhaAtual: 'errada', novaSenha: 'nova-senha-1' })
        .expect(400)
      await gestor
        .put('/api/auth/senha')
        .send({ senhaAtual: GESTOR.senha, novaSenha: 'nova-senha-1' })
        .expect(204)
      await request(app).post('/api/auth/login').send(GESTOR).expect(401)
      await request(app)
        .post('/api/auth/login')
        .send({ ...GESTOR, senha: 'nova-senha-1' })
        .expect(200)

      await gestor.put(`/api/usuarios/${criada.id}`).send({ ativo: false }).expect(200)
      await request(app)
        .post('/api/auth/login')
        .send({ email: nova.email, senha: nova.senha })
        .expect(401)
    })
  })

  describe('sessões no banco (F5-09)', () => {
    it('sobrevivem a um novo processo e caem ao desativar a conta', async () => {
      const armazem = new ArmazemDeSessoes(db)
      const app1 = criarApp({ armazem })
      const login = await request(app1).post('/api/auth/login').send(GESTOR).expect(200)
      const cookie = login.headers['set-cookie'][0].split(';')[0]
      expect(await db('sessao').count({ n: '*' }).first()).toEqual({ n: 1 })

      // Outra instância da API (reinício) reconhece a mesma sessão.
      const app2 = criarApp({ armazem: new ArmazemDeSessoes(db) })
      await request(app2).get('/api/auth/eu').set('Cookie', cookie).expect(200)

      const { id } = login.body.usuario
      expect(await armazem.encerrarDoUsuario(id)).toBe(1)
      await request(app2).get('/api/auth/eu').set('Cookie', cookie).expect(401)

      // Logout apaga a linha; sessões vencidas somem na limpeza.
      const outro = await request(app1).post('/api/auth/login').send(GESTOR)
      const c2 = outro.headers['set-cookie'][0].split(';')[0]
      await request(app1).post('/api/auth/logout').set('Cookie', c2).expect(204)
      await db('sessao').insert({
        sid: 'velha',
        dados: '{}',
        expira_em: new Date(Date.now() - 1000),
      })
      await armazem.limpar()
      expect(await db('sessao').count({ n: '*' }).first()).toEqual({ n: 0 })
      armazem.fechar()
    })
  })
})
