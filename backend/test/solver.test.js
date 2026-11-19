// F2-02, F2-08 a F2-14 — Grade em memória, avaliação incremental e solver.
import { describe, expect, it } from 'vitest'
import { criarAleatorio } from '../src/core/aleatorio.js'
import { Avaliador } from '../src/core/avaliador.js'
import { Grade } from '../src/core/grade.js'
import { criarInstancia } from '../src/core/instancia.js'
import { resolver, validarSolucao } from '../src/core/index.js'
import { construir, eliminarChoques, reparar } from '../src/core/solver/construcao.js'
import { Estado, dividirEmBlocos } from '../src/core/solver/estado.js'
import { sortearMovimento } from '../src/core/solver/movimentos.js'
import { gerarProblemaFicticio } from '../scripts/problema-ficticio.js'
import { M, N, h, problemaBase } from './ajuda/problema.js'

describe('grade em memória', () => {
  it('indexa por professor, turma, sala e atribuição e desfaz ao retirar', () => {
    const inst = criarInstancia(problemaBase())
    const g = new Grade(inst)
    const hor = inst.idx.horario.get(h(1, M, 1))
    const i = g.adicionar(0, hor, 0) // MAT da INF1M, Ana, Sala 1
    expect(g.professorLivre(0, hor)).toBe(false)
    expect(g.salaLivre(0, hor)).toBe(false)
    expect(g.aulasDaTurma(0, hor)).toEqual([i])
    expect(g.porAtribuicao[0]).toEqual([i])
    g.retirar(i)
    expect(g.professorLivre(0, hor)).toBe(true)
    expect(g.porProfessor[0]).toEqual([])
    expect(g.hor[i]).toBe(-1)
  })

  it('aceita na turma só atribuições do mesmo grupo paralelo', () => {
    const inst = criarInstancia(problemaBase())
    const g = new Grade(inst)
    const hor = inst.idx.horario.get(h(1, M, 1))
    g.adicionar(2, hor, 2) // PROG-A no laboratório
    expect(g.turmaAceita(3, hor)).toBe(true) // PROG-B, mesmo grupo
    expect(g.turmaAceita(2, hor)).toBe(false) // PROG-A de novo
    expect(g.turmaAceita(0, hor)).toBe(false) // MAT, sem grupo
  })
})

describe('avaliação incremental', () => {
  // Compara o cache incremental com uma avaliação do zero, restrição por restrição.
  function conferir(estado) {
    const novo = new Avaliador(estado.grade)
    novo.avaliarTudo()
    expect(estado.av.rigido).toBe(novo.rigido)
    expect(estado.av.flexivel).toBe(novo.flexivel)
    estado.av.modulos.forEach((m, k) =>
      expect([m.codigo, m.total]).toEqual([m.codigo, novo.modulos[k].total])
    )
  }

  it('dá o mesmo resultado que a avaliação completa após milhares de movimentos', () => {
    const inst = criarInstancia(gerarProblemaFicticio({ turmasIntegrado: 6, turmasSubsequente: 2 }))
    const rnd = criarAleatorio('equivalencia')
    const estado = new Estado(inst)
    // Começa com metade dos blocos alocados ao acaso, com choques de todo tipo.
    for (const b of estado.ativos) {
      if (rnd.proximo() < 0.5) continue
      const d = estado.dominio(b.a, b.tam)
      estado.posicionar(b, rnd.escolher(d), inst.S ? rnd.escolher(inst.atrSalas[b.a]) : -1)
    }
    conferir(estado)
    for (let k = 1; k <= 3000; k++) {
      const mov = sortearMovimento(estado, rnd)
      if (!mov) continue
      estado.experimentar(mov)
      if (rnd.proximo() < 0.5) estado.aceitar()
      else estado.desfazer(mov)
      if (k % 500 === 0) conferir(estado)
    }
    conferir(estado)
  })

  it('volta ao custo original ao desfazer um movimento', () => {
    const inst = criarInstancia(gerarProblemaFicticio({ turmasIntegrado: 4, turmasSubsequente: 1 }))
    const rnd = criarAleatorio('desfazer')
    const estado = new Estado(inst)
    reparar(estado, construir(estado, rnd), rnd)
    const antes = estado.av.custoTotal
    const foto = estado.grade.fotografar()
    for (let k = 0; k < 200; k++) {
      const mov = sortearMovimento(estado, rnd)
      if (!mov) continue
      estado.experimentar(mov)
      estado.desfazer(mov)
    }
    expect(estado.av.custoTotal).toBe(antes)
    expect(estado.grade.fotografar()).toEqual(foto)
    conferir(estado)
  })
})

describe('blocos', () => {
  it('divide as aulas conforme o tamanho do bloco geminado', () => {
    expect(dividirEmBlocos(4, 2)).toEqual([2, 2])
    expect(dividirEmBlocos(5, 2)).toEqual([2, 2, 1])
    expect(dividirEmBlocos(3, 1)).toEqual([1, 1, 1])
    expect(dividirEmBlocos(2, 3)).toEqual([2])
    expect(dividirEmBlocos(0, 2)).toEqual([])
  })
})

describe('solver', () => {
  const rapido = (extra = {}) => ({
    ...problemaBase(extra),
    opcoes: { semente: 'teste', maxIteracoes: 5000, tempoLimiteMs: 10_000, ...extra.opcoes },
  })

  it('gera grade válida e completa para o problema pequeno', () => {
    const s = validarSolucao(resolver(rapido()))
    expect(s.valida).toBe(true)
    expect(s.naoAlocados).toEqual([])
    expect(s.aulas).toHaveLength(14)
    // Aulas geminadas ficaram juntas e cada turma no seu turno.
    expect(s.pontuacaoPorRestricao.F1).toBe(0)
    expect(s.pontuacaoPorRestricao.R5).toBe(0)
  })

  it('repete o resultado com a mesma semente e o mesmo limite de iterações', () => {
    const problema = gerarProblemaFicticio({
      turmasIntegrado: 4,
      turmasSubsequente: 1,
      opcoes: { semente: 'abc', maxIteracoes: 3000, tempoLimiteMs: 30_000 },
    })
    const a = resolver(problema)
    const b = resolver(problema)
    expect(b.aulas).toEqual(a.aulas)
    expect(b.pontuacao).toBe(a.pontuacao)
    const c = resolver({ ...problema, opcoes: { ...problema.opcoes, semente: 'xyz' } })
    expect(c.aulas).not.toEqual(a.aulas)
  })

  it('mantém aulas fixadas no lugar', () => {
    const fixa = { atribuicaoId: 1, horarioId: h(3, M, 3), salaId: 2 }
    const s = resolver(rapido({ aulasFixadas: [fixa] }))
    expect(s.aulas).toContainEqual({ ...fixa, fixada: true })
    expect(s.aulas.filter((a) => a.atribuicaoId === 1)).toHaveLength(4)
    expect(s.pontuacaoPorRestricao.R8).toBe(0)
    expect(s.valida).toBe(true)
  })

  it('não falha quando todas as aulas estão fixadas', () => {
    const primeira = resolver(rapido())
    const aulasFixadas = primeira.aulas.map(({ atribuicaoId, horarioId, salaId }) => ({
      atribuicaoId,
      horarioId,
      salaId,
    }))
    const s = resolver(rapido({ aulasFixadas }))
    expect(s.motivoFim).toBe('sem-blocos')
    expect(s.iteracoes).toBe(0)
    expect(s.aulas).toHaveLength(primeira.aulas.length)
    expect(s.aulas.every((a) => a.fixada)).toBe(true)
    expect(validarSolucao(s).valida).toBe(true)
  })

  it('explica por que uma atribuição ficou sem lugar', () => {
    // Bruno indisponível em todo o matutino: POR e PROG-A da INF1M não têm onde ficar.
    const indisponibilidades = []
    for (let dia = 1; dia <= 5; dia++)
      for (let t = 1; t <= 4; t++)
        indisponibilidades.push({ tipoRecurso: 'professor', recursoId: 2, horarioId: h(dia, M, t) })
    const s = resolver(rapido({ indisponibilidades }))
    expect(s.valida).toBe(false)
    const por = s.naoAlocados.find((n) => n.atribuicaoId === 2)
    expect(por.aulasFaltantes).toBe(2)
    expect(por.motivos[0]).toBe('R6: professor Bruno indisponível em 20 de 20 posições')
    expect(s.pontuacaoPorRestricao.R4).toBe(4)
  })

  it('aponta quando não existe sala compatível', () => {
    const salas = problemaBase().salas.filter((s) => s.tipo !== 'laboratorio')
    const s = resolver(rapido({ salas }))
    expect(s.naoAlocados).toEqual([])
    expect(s.pontuacaoPorRestricao.R7).toBe(2)
    expect(s.violacoes.find((v) => v.codigo === 'R7').mensagem).toContain('exige "laboratorio"')
  })

  it('atende geminadas em turno de um tempo dividindo o bloco (F1)', () => {
    const p = rapido()
    // A INF1N passa a ter um único tempo por noite: o bloco de 2 não cabe.
    p.horarios = p.horarios.filter((x) => x.turnoId !== N || x.ordem === 1)
    const s = resolver(p)
    expect(s.valida).toBe(true)
    expect(s.aulas.filter((a) => a.atribuicaoId === 5)).toHaveLength(4)
    expect(s.pontuacaoPorRestricao.F1).toBeGreaterThan(0)
  })

  it('para quando pedido e informa o progresso', () => {
    const etapas = []
    let chamadas = 0
    const s = resolver(
      { ...problemaBase(), opcoes: { semente: '1', tempoLimiteMs: 60_000 } },
      {
        aoProgresso: (i) => etapas.push(i.etapa),
        deveParar: () => ++chamadas > 3,
      }
    )
    expect(s.motivoFim === 'cancelado' || s.motivoFim === 'otimo').toBe(true)
    expect(s.tempoMs).toBeLessThan(5000)
    expect(etapas[0]).toBe('construcao')
    expect(etapas).toContain('melhoria')
  })

  it('turma com mais aulas que horários deixa o excesso de fora, sem choque', () => {
    const p = rapido()
    // INF1M só com os dois primeiros tempos da manhã: 10 horários para 12 aulas.
    p.horarios = p.horarios.filter((x) => x.turnoId !== M || x.ordem <= 2)
    p.atribuicoes = p.atribuicoes.map((a) => (a.id === 2 ? { ...a, aulasSemanais: 6 } : a))
    for (const semente of ['a', 'b', 'c']) {
      const s = validarSolucao(resolver({ ...p, opcoes: { ...p.opcoes, semente } }))
      const choques = s.violacoes.filter((v) => ['R1', 'R2', 'R3'].includes(v.codigo))
      expect(choques).toEqual([])
      expect(s.naoAlocados.reduce((n, x) => n + x.aulasFaltantes, 0)).toBe(2)
      expect(s.pontuacaoPorRestricao.R4).toBe(2)
    }
  })

  it('choque custa mais ao solver que aula faltando', () => {
    const inst = criarInstancia(problemaBase())
    const estado = new Estado(inst)
    const hor = inst.idx.horario.get(h(1, M, 1))
    const mat = estado.ativos.find((b) => b.a === 0)
    const por = estado.ativos.find((b) => b.a === 1)
    estado.posicionar(mat, hor, 0)
    const antes = estado.av.custoTotal
    // POR na hora da MAT: troca uma aula faltando (R4) por um choque de turma (R2).
    expect(estado.simular(por, hor, 1)).toBeGreaterThan(0)
    expect(estado.av.custoTotal).toBe(antes)
  })

  it('tira da grade a aula que ficou em choque e tenta recolocá-la sem choque', () => {
    const inst = criarInstancia(problemaBase())
    const rnd = criarAleatorio('choque')
    const estado = new Estado(inst)
    reparar(estado, construir(estado, rnd), rnd)
    // Força a POR da INF1M no mesmo horário de uma MAT da mesma turma.
    const mat = estado.ativos.find((b) => b.a === 0 && b.h0 >= 0)
    const por = estado.ativos.find((b) => b.a === 1)
    estado.posicionar(por, mat.h0, 1)
    expect(estado.av.rigido).toBeGreaterThan(0)
    expect(eliminarChoques(estado, rnd)).toBe(1)
    const r = estado.av.relatorio()
    expect(r.violacoes.filter((v) => ['R1', 'R2', 'R3'].includes(v.codigo))).toEqual([])
    expect(r.valida).toBe(true) // havia lugar livre: a aula voltou para a grade
  })

  it('fecha o campus fictício sem violação rígida', () => {
    const s = resolver(
      gerarProblemaFicticio({
        opcoes: { semente: 'campus', maxIteracoes: 60_000, tempoLimiteMs: 30_000 },
      })
    )
    expect(s.valida).toBe(true)
    expect(s.naoAlocados).toEqual([])
    expect(s.aulas).toHaveLength(352)
  })
})
