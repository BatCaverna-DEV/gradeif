// Estado do solver: a grade, o avaliador e os blocos que o solver movimenta.
//
// F2-10 — Cada atribuição é dividida em blocos conforme o tamanho do bloco
// geminado (5 aulas em blocos de 2 → 2 + 2 + 1). Um bloco ocupa tempos seguidos
// do mesmo turno e dia, todos na mesma sala. Aulas fixadas não viram blocos: entram
// na grade já alocadas e nunca se movem.

import { Grade } from '../grade.js'
import { Avaliador } from '../avaliador.js'
import { INDISPONIVEL } from '../instancia.js'

export const SEM_SALA_LIVRE = -2

export function dividirEmBlocos(aulas, tamanho) {
  const blocos = []
  const b = Math.max(1, tamanho)
  for (let resto = aulas; resto > 0; resto -= b) blocos.push(Math.min(b, resto))
  return blocos
}

export class Estado {
  constructor(inst) {
    this.inst = inst
    const g = (this.grade = new Grade(inst))

    for (const f of inst.fixadas) g.adicionar(f.a, f.h, f.s, true)

    this.blocos = []
    for (let a = 0; a < inst.A; a++) {
      const restantes = inst.atrAulas[a] - inst.fixadasPorAtr[a].length
      for (const tam of dividirEmBlocos(restantes, inst.atrBloco[a])) {
        const aulas = Array.from({ length: tam }, () => g.adicionar(a))
        this.blocos.push({ id: this.blocos.length, a, tam, aulas, h0: -1, s: -1, ativo: true })
      }
    }
    this.av = new Avaliador(g)
    this.av.avaliarTudo()
    this.jornal = null
    this.dominios = new Map()
    this.recalcularListas()
  }

  // Listas auxiliares (refeitas quando um bloco é dividido no reparo).
  recalcularListas() {
    this.ativos = this.blocos.filter((b) => b.ativo)
    this.blocoDaAula = new Int32Array(this.grade.totalAulas).fill(-1)
    this.porTurma = Array.from({ length: this.inst.T }, () => [])
    for (const b of this.ativos) {
      for (const i of b.aulas) this.blocoDaAula[i] = b.id
      this.porTurma[this.inst.atrTurma[b.a]].push(b)
    }
  }

  // Horários de um bloco de `tam` tempos começando em h0, ou null se não couber.
  tempos(h0, tam) {
    const hs = [h0]
    let h = h0
    for (let k = 1; k < tam; k++) {
      h = this.inst.prox[h]
      if (h < 0) return null
      hs.push(h)
    }
    return hs
  }

  // Inícios possíveis para um bloco: turno permitido para a turma, tempos seguidos
  // suficientes e, se houver opção, sem indisponibilidade rígida de professor ou
  // turma. Sem nenhuma opção, a lista fica vazia.
  dominio(a, tam) {
    const chave = a * 64 + tam
    let lista = this.dominios.get(chave)
    if (lista) return lista
    const { inst } = this
    const { H } = inst
    const t = inst.atrTurma[a]
    const cabe = []
    const livres = []
    for (let h = 0; h < H; h++) {
      if (!inst.turmaTurnos[t][inst.horTurno[h]]) continue
      const hs = this.tempos(h, tam)
      if (!hs) continue
      cabe.push(h)
      const bloqueado = hs.some(
        (x) =>
          inst.indisp.turma[t * H + x] === INDISPONIVEL ||
          inst.atrProfs[a].some((p) => inst.indisp.professor[p * H + x] === INDISPONIVEL)
      )
      if (!bloqueado) livres.push(h)
    }
    lista = livres.length ? livres : cabe
    this.dominios.set(chave, lista)
    return lista
  }

  // ---------- Viabilidade (sem violar regra rígida) ----------

  // Professores e turma livres e disponíveis em todos os tempos do bloco.
  viavelSemSala(b, hs) {
    const { inst, grade: g } = this
    const { H } = inst
    const t = inst.atrTurma[b.a]
    for (const h of hs) {
      if (!inst.turmaTurnos[t][inst.horTurno[h]]) return false
      if (inst.indisp.turma[t * H + h] === INDISPONIVEL) return false
      if (!g.turmaAceita(b.a, h)) return false
      for (const p of inst.atrProfs[b.a]) {
        if (inst.indisp.professor[p * H + h] === INDISPONIVEL) return false
        if (!g.professorLivre(p, h)) return false
      }
    }
    return true
  }

  salaServe(s, hs) {
    const { inst, grade: g } = this
    return hs.every((h) => g.salaLivre(s, h) && inst.indisp.sala[s * inst.H + h] !== INDISPONIVEL)
  }

  // Sala compatível livre em todos os tempos. Prefere a sala que a turma já usa no
  // mesmo turno e dia (F10); depois a menor que comporte a turma.
  // Devolve -1 quando o problema não tem salas e SEM_SALA_LIVRE quando nenhuma serve.
  escolherSala(b, hs, evitar = -1) {
    const { inst, grade: g } = this
    if (inst.S === 0) return -1
    const candidatas = inst.atrSalas[b.a]
    if (inst.atrGrupo[b.a] < 0) {
      const t = inst.atrTurma[b.a]
      for (const i of g.porTurma[t]) {
        const s = g.sala[i]
        if (
          s >= 0 &&
          s !== evitar &&
          this.blocoDaAula[i] !== b.id &&
          inst.atrGrupo[g.atr[i]] < 0 &&
          inst.horDia[g.hor[i]] === inst.horDia[hs[0]] &&
          inst.horTurno[g.hor[i]] === inst.horTurno[hs[0]] &&
          candidatas.includes(s) &&
          this.salaServe(s, hs)
        )
          return s
      }
    }
    for (const s of candidatas) if (s !== evitar && this.salaServe(s, hs)) return s
    return SEM_SALA_LIVRE
  }

  // ---------- Alterações ----------

  // Move as aulas do bloco (h0 = -1 retira o bloco da grade). Não avalia.
  aplicar(b, h0, s) {
    const g = this.grade
    for (const i of b.aulas) g.retirar(i)
    b.h0 = h0
    b.s = h0 >= 0 ? s : -1
    if (h0 < 0) return
    const hs = this.tempos(h0, b.tam)
    for (let k = 0; k < b.tam; k++) g.colocar(b.aulas[k], hs[k], b.s)
  }

  // Move e grava a variação no avaliador. Com jornal ativo, registra para desfazer.
  posicionar(b, h0, s) {
    if (this.jornal) this.jornal.push(b, b.h0, b.s)
    const av = this.av
    av.iniciarMudanca()
    av.tocarAulas(b.aulas)
    this.aplicar(b, h0, s)
    av.tocarAulas(b.aulas)
    av.calcularVariacao()
    av.confirmar()
  }

  // Variação do custo total se o bloco fosse para (h0, s); a grade volta como estava.
  simular(b, h0, s) {
    const av = this.av
    const h0Antes = b.h0
    const sAntes = b.s
    av.iniciarMudanca()
    av.tocarAulas(b.aulas)
    this.aplicar(b, h0, s)
    av.tocarAulas(b.aulas)
    const v = av.calcularVariacao().total
    av.descartar()
    this.aplicar(b, h0Antes, sAntes)
    return v
  }

  // Jornal: permite desfazer uma sequência de posicionamentos (reparo em cadeia).
  marcar() {
    this.jornal ??= []
    return this.jornal.length
  }

  voltar(marca) {
    const j = this.jornal
    this.jornal = null
    while (j.length > marca) {
      const s = j.pop()
      const h0 = j.pop()
      const b = j.pop()
      this.posicionar(b, h0, s)
    }
    this.jornal = j
  }

  encerrarJornal() {
    this.jornal = null
  }

  // ---------- Movimentos genéricos (recozimento) ----------
  // mov = { blocos: [b...], destinos: [[h0, s]...] }
  experimentar(mov) {
    const av = this.av
    mov.origens = mov.blocos.map((b) => [b.h0, b.s])
    av.iniciarMudanca()
    for (const b of mov.blocos) av.tocarAulas(b.aulas)
    mov.blocos.forEach((b, k) => this.aplicar(b, mov.destinos[k][0], mov.destinos[k][1]))
    for (const b of mov.blocos) av.tocarAulas(b.aulas)
    return av.calcularVariacao()
  }

  aceitar() {
    this.av.confirmar()
  }

  desfazer(mov) {
    this.av.descartar()
    for (const b of mov.blocos) this.aplicar(b, -1, -1)
    mov.blocos.forEach((b, k) => this.aplicar(b, mov.origens[k][0], mov.origens[k][1]))
  }

  // ---------- Melhor solução ----------
  fotografar() {
    const blocos = new Int32Array(this.blocos.length * 2)
    this.blocos.forEach((b, k) => {
      blocos[2 * k] = b.h0
      blocos[2 * k + 1] = b.s
    })
    return { grade: this.grade.fotografar(), blocos }
  }

  restaurar(foto) {
    this.grade.restaurar(foto.grade)
    this.blocos.forEach((b, k) => {
      b.h0 = foto.blocos[2 * k]
      b.s = foto.blocos[2 * k + 1]
    })
    this.av.avaliarTudo()
  }
}
