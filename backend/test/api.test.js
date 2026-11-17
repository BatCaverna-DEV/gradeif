// Testes da API que não dependem do banco estar no ar.
import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { criarApp } from '../src/app.js'
import { encerrarBanco } from '../src/db/knex.js'
import { GradeHorariaSchema } from '../src/rotas/periodos.js'

const app = criarApp()

afterAll(async () => {
  await encerrarBanco()
})

describe('API', () => {
  it('responde a rota de saúde com a situação do banco', async () => {
    const res = await request(app).get('/api/saude')
    expect([200, 503]).toContain(res.status)
    expect(res.body.api).toBe('ok')
    expect(['ok', 'indisponivel']).toContain(res.body.banco)
  })

  it('devolve 404 em JSON para rota inexistente', async () => {
    const res = await request(app).get('/api/nao-existe')
    expect(res.status).toBe(404)
    expect(res.body.erro).toMatch(/não existe/)
  })

  it('exige login para listar períodos', async () => {
    const res = await request(app).get('/api/periodos')
    expect(res.status).toBe(401)
  })

  it('valida o corpo do login antes de consultar o banco', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x', senha: '' })
    expect(res.status).toBe(400)
    expect(res.body.detalhes.map((d) => d.campo)).toEqual(['email', 'senha'])
  })

  it('expõe o catálogo de restrições', async () => {
    const res = await request(app).get('/api/restricoes/catalogo')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(18)
  })
})

describe('validação da grade horária', () => {
  it('ordena e remove dias repetidos', () => {
    const g = GradeHorariaSchema.parse({
      dias: [3, 1, 1, 2],
      turnos: [{ nome: 'Matutino', tempos: [{ horaInicio: '07:00', horaFim: '07:50' }] }],
    })
    expect(g.dias).toEqual([1, 2, 3])
  })

  it('recusa tempo com início depois do fim', () => {
    expect(() =>
      GradeHorariaSchema.parse({
        dias: [1],
        turnos: [{ nome: 'Matutino', tempos: [{ horaInicio: '08:00', horaFim: '07:00' }] }],
      })
    ).toThrow()
  })
})
