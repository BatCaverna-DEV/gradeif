// F2-08 — Avaliador: soma os custos de todas as restrições ativas.
//
// Modo completo: avaliarTudo() calcula o custo de cada unidade (professor, turma,
// sala, atribuição) de cada restrição e guarda num cache.
// Modo incremental: quem altera a grade avisa quais aulas tocou (antes e depois da
// alteração); calcularVariacao() recalcula só as unidades afetadas e devolve a
// diferença em relação ao cache. confirmar() grava a diferença; descartar() a
// esquece (quem alterou a grade deve desfazer a alteração).
//
// Pontuação: rígidas contam sem peso, flexíveis multiplicadas pelo peso. Para o
// solver, o custo total é rigidoPonderado * PESO_RIGIDA + flexivel, de modo que
// qualquer violação rígida pesa mais que muitas flexíveis. Entre as rígidas, os
// choques (R1 a R3) pesam PESO_CHOQUE: deixar uma aula de fora (R4) sai sempre
// mais barato que encaixá-la em choque com outra.

import { ESCOPOS, restricoesRegistradas } from './restricoes/index.js'

export const PESO_RIGIDA = 1000
export const PESO_CHOQUE = 10
export const CHOQUES = Object.freeze(['R1', 'R2', 'R3'])

export class Avaliador {
  constructor(grade) {
    this.grade = grade
    const { inst } = grade
    this.modulos = restricoesRegistradas()
      .filter((m) => inst.config[m.codigo].ativa)
      .map((m) => {
        const cfg = inst.config[m.codigo]
        return {
          modulo: m,
          codigo: m.codigo,
          escopo: m.escopo,
          cfg,
          rigida: cfg.rigida,
          peso: cfg.rigida ? 1 : cfg.peso,
          // Peso dentro do custo rígido do solver; o relatório conta sem peso.
          pesoRigido: CHOQUES.includes(m.codigo) ? PESO_CHOQUE : 1,
          cache: new Float64Array(inst.tamanho[m.escopo]),
          total: 0, // soma sem peso
        }
      })
    this.porEscopo = Object.fromEntries(
      ESCOPOS.map((e) => [e, this.modulos.filter((m) => m.escopo === e)])
    )
    this.rigido = 0
    this.rigidoPonderado = 0
    this.flexivel = 0

    // Unidades tocadas na mudança em curso (marca por carimbo, sem limpar arrays).
    this.carimbo = 1
    this.marca = Object.fromEntries(ESCOPOS.map((e) => [e, new Int32Array(inst.tamanho[e])]))
    this.tocados = Object.fromEntries(ESCOPOS.map((e) => [e, []]))
    this.pendentes = [] // [modulo, r, novoCusto]
  }

  get custoTotal() {
    return this.rigidoPonderado * PESO_RIGIDA + this.flexivel
  }

  // ---------- Modo completo ----------
  avaliarTudo() {
    const g = this.grade
    this.rigido = 0
    this.rigidoPonderado = 0
    this.flexivel = 0
    for (const m of this.modulos) {
      m.total = 0
      for (let r = 0; r < m.cache.length; r++) {
        const c = m.modulo.custo(g, r, m.cfg)
        m.cache[r] = c
        m.total += c
      }
      if (m.rigida) {
        this.rigido += m.total
        this.rigidoPonderado += m.total * m.pesoRigido
      } else this.flexivel += m.total * m.peso
    }
    this.pendentes.length = 0
    return { rigido: this.rigido, flexivel: this.flexivel, total: this.custoTotal }
  }

  // ---------- Modo incremental ----------
  iniciarMudanca() {
    this.carimbo++
    for (const e of ESCOPOS) this.tocados[e].length = 0
    this.pendentes.length = 0
  }

  tocar(escopo, r) {
    if (this.marca[escopo][r] === this.carimbo) return
    this.marca[escopo][r] = this.carimbo
    this.tocados[escopo].push(r)
  }

  // Chamar antes e depois de mover a aula, para pegar a sala antiga e a nova.
  tocarAula(i) {
    const g = this.grade
    const { inst } = g
    const a = g.atr[i]
    this.tocar('atribuicao', a)
    this.tocar('turma', inst.atrTurma[a])
    for (const p of inst.atrProfs[a]) this.tocar('professor', p)
    if (g.sala[i] >= 0) this.tocar('sala', g.sala[i])
  }

  tocarAulas(aulas) {
    for (const i of aulas) this.tocarAula(i)
  }

  calcularVariacao() {
    const g = this.grade
    let rigido = 0
    let ponderado = 0
    let flexivel = 0
    this.pendentes.length = 0
    for (const e of ESCOPOS) {
      const mods = this.porEscopo[e]
      if (!mods.length) continue
      for (const r of this.tocados[e]) {
        for (const m of mods) {
          const novo = m.modulo.custo(g, r, m.cfg)
          const d = novo - m.cache[r]
          if (d === 0) continue
          this.pendentes.push(m, r, novo)
          if (m.rigida) {
            rigido += d
            ponderado += d * m.pesoRigido
          } else flexivel += d * m.peso
        }
      }
    }
    this.variacao = { rigido, flexivel, total: ponderado * PESO_RIGIDA + flexivel }
    return this.variacao
  }

  confirmar() {
    const p = this.pendentes
    for (let k = 0; k < p.length; k += 3) {
      const m = p[k]
      const r = p[k + 1]
      const d = p[k + 2] - m.cache[r]
      m.cache[r] = p[k + 2]
      m.total += d
      if (m.rigida) {
        this.rigido += d
        this.rigidoPonderado += d * m.pesoRigido
      } else this.flexivel += d * m.peso
    }
    p.length = 0
  }

  descartar() {
    this.pendentes.length = 0
  }

  // ---------- Relatório ----------
  // posicao: mapa opcional índice da aula → posição na lista exportada.
  relatorio(posicao = null) {
    const g = this.grade
    const pontuacaoPorRestricao = {}
    const violacoes = []
    for (const m of this.modulos) {
      pontuacaoPorRestricao[m.codigo] = m.total * m.peso
      if (!m.total) continue
      for (let r = 0; r < m.cache.length; r++) {
        if (!m.cache[r]) continue
        for (const v of m.modulo.violacoes(g, r, m.cfg)) {
          if (posicao) v.aulas = v.aulas.map((i) => posicao[i]).filter((i) => i >= 0)
          violacoes.push(v)
        }
      }
    }
    return {
      valida: this.rigido === 0,
      custoRigido: this.rigido,
      pontuacao: this.flexivel,
      pontuacaoPorRestricao,
      violacoes,
    }
  }
}
