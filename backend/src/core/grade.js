// F2-02 — Grade em memória com índices por professor, turma, sala e atribuição.
//
// Cada aula é um número (posição nos arrays atr/hor/sala/fixada). Uma aula com
// hor = -1 existe mas não está alocada e não aparece em nenhum índice.
// Para cada recurso há:
//   - a lista das aulas alocadas (porProfessor[p], porTurma[t], ...);
//   - as células recurso × horário com as aulas daquele horário
//     (celProfessor[p * H + h]), para saber em tempo constante se está ocupado.
// A grade aceita choques (duas aulas na mesma célula): quem decide se isso é
// permitido são as restrições.

function retirarDaLista(lista, valor) {
  const i = lista.indexOf(valor)
  if (i < 0) return
  lista[i] = lista[lista.length - 1]
  lista.pop()
}

export class Grade {
  constructor(inst) {
    this.inst = inst
    const { H, P, T, S, A } = inst
    this.H = H
    this.atr = []
    this.hor = []
    this.sala = []
    this.fixada = []

    const listas = (n) => Array.from({ length: n }, () => [])
    this.porAtribuicao = listas(A)
    this.porTurma = listas(T)
    this.porProfessor = listas(P)
    this.porSala = listas(S)
    // Células criadas sob demanda (null = vazia).
    this.celProfessor = new Array(P * H).fill(null)
    this.celTurma = new Array(T * H).fill(null)
    this.celSala = new Array(S * H).fill(null)
  }

  get totalAulas() {
    return this.atr.length
  }

  // Cria uma aula da atribuição a; se h >= 0, já aloca.
  adicionar(a, h = -1, s = -1, fixada = false) {
    const i = this.atr.length
    this.atr.push(a)
    this.hor.push(-1)
    this.sala.push(-1)
    this.fixada.push(fixada)
    if (h >= 0) this.colocar(i, h, s)
    return i
  }

  colocar(i, h, s = -1) {
    if (this.hor[i] >= 0) throw new Error(`Aula ${i} já está alocada`)
    const { H, inst } = this
    const a = this.atr[i]
    const t = inst.atrTurma[a]
    this.hor[i] = h
    this.sala[i] = s
    this.porAtribuicao[a].push(i)
    this.porTurma[t].push(i)
    ;(this.celTurma[t * H + h] ??= []).push(i)
    for (const p of inst.atrProfs[a]) {
      this.porProfessor[p].push(i)
      ;(this.celProfessor[p * H + h] ??= []).push(i)
    }
    if (s >= 0) {
      this.porSala[s].push(i)
      ;(this.celSala[s * H + h] ??= []).push(i)
    }
  }

  retirar(i) {
    const h = this.hor[i]
    if (h < 0) return
    const { H, inst } = this
    const a = this.atr[i]
    const t = inst.atrTurma[a]
    const s = this.sala[i]
    retirarDaLista(this.porAtribuicao[a], i)
    retirarDaLista(this.porTurma[t], i)
    retirarDaLista(this.celTurma[t * H + h], i)
    for (const p of inst.atrProfs[a]) {
      retirarDaLista(this.porProfessor[p], i)
      retirarDaLista(this.celProfessor[p * H + h], i)
    }
    if (s >= 0) {
      retirarDaLista(this.porSala[s], i)
      retirarDaLista(this.celSala[s * H + h], i)
    }
    this.hor[i] = -1
    this.sala[i] = -1
  }

  mover(i, h, s = -1) {
    this.retirar(i)
    if (h >= 0) this.colocar(i, h, s)
  }

  // ---------- Consultas em tempo constante ----------
  aulasDoProfessor(p, h) {
    return this.celProfessor[p * this.H + h] ?? []
  }

  aulasDaTurma(t, h) {
    return this.celTurma[t * this.H + h] ?? []
  }

  aulasDaSala(s, h) {
    return this.celSala[s * this.H + h] ?? []
  }

  professorLivre(p, h) {
    return !this.celProfessor[p * this.H + h]?.length
  }

  salaLivre(s, h) {
    return !this.celSala[s * this.H + h]?.length
  }

  // A turma aceita mais uma aula da atribuição a no horário h? Só se estiver vazia
  // ou se todas as aulas ali forem de outras atribuições do mesmo grupo paralelo.
  turmaAceita(a, h) {
    const cel = this.celTurma[this.inst.atrTurma[a] * this.H + h]
    if (!cel?.length) return true
    const g = this.inst.atrGrupo[a]
    if (g < 0) return false
    return cel.every((i) => this.atr[i] !== a && this.inst.atrGrupo[this.atr[i]] === g)
  }

  // ---------- Fotografia das posições (melhor solução do recozimento) ----------
  fotografar() {
    return { hor: Int32Array.from(this.hor), sala: Int32Array.from(this.sala) }
  }

  restaurar(foto) {
    for (let i = 0; i < this.atr.length; i++) this.retirar(i)
    for (let i = 0; i < this.atr.length; i++)
      if (foto.hor[i] >= 0) this.colocar(i, foto.hor[i], foto.sala[i])
  }

  // Aulas alocadas no formato da solução, com o mapa índice → posição na lista.
  exportar() {
    const { problema } = this.inst
    const aulas = []
    const posicao = new Int32Array(this.atr.length).fill(-1)
    for (let i = 0; i < this.atr.length; i++) {
      if (this.hor[i] < 0) continue
      posicao[i] = aulas.length
      aulas.push({
        atribuicaoId: problema.atribuicoes[this.atr[i]].id,
        horarioId: this.inst.horarios[this.hor[i]].id,
        salaId: this.sala[i] >= 0 ? problema.salas[this.sala[i]].id : null,
        fixada: this.fixada[i],
      })
    }
    return { aulas, posicao }
  }
}
