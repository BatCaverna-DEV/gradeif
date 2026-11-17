// F2-11 — Construção gulosa e F2-12 — Reparo por deslocamento em cadeia.

import { INDISPONIVEL } from '../instancia.js'
import { SEM_SALA_LIVRE } from './estado.js'

// Até quantos blocos o reparo aceita tirar do lugar para encaixar um bloco.
const MAXIMO_DESLOCADOS = 2
const PROFUNDIDADE_REPARO = 2

// Melhor posição sem violação rígida para um bloco fora da grade: menor variação
// de custo, com desempate aleatório (amostragem de reservatório).
export function melhorPosicao(estado, b, rnd) {
  let melhor = null
  let empates = 0
  for (const h0 of estado.dominio(b.a, b.tam)) {
    const hs = estado.tempos(h0, b.tam)
    if (!estado.viavelSemSala(b, hs)) continue
    const s = estado.escolherSala(b, hs)
    if (s === SEM_SALA_LIVRE) continue
    const v = estado.simular(b, h0, s)
    if (!melhor || v < melhor.v) {
      melhor = { h0, s, v }
      empates = 1
    } else if (v === melhor.v && rnd.inteiro(++empates) === 0) {
      melhor = { h0, s, v }
    }
  }
  return melhor
}

function colocarGuloso(estado, b, rnd) {
  const m = melhorPosicao(estado, b, rnd)
  if (!m) return false
  estado.posicionar(b, m.h0, m.s)
  return true
}

// Ordem da construção: primeiro os blocos com menos posições possíveis, depois os
// maiores, depois os de professores mais carregados.
function ordenarBlocos(estado, blocos, rnd) {
  const { inst } = estado
  const cargaProf = new Int32Array(inst.P)
  for (let a = 0; a < inst.A; a++)
    for (const p of inst.atrProfs[a]) cargaProf[p] += inst.atrAulas[a]
  const chave = new Map(
    blocos.map((b) => [
      b,
      {
        opcoes: estado.dominio(b.a, b.tam).length,
        carga: Math.max(...inst.atrProfs[b.a].map((p) => cargaProf[p])),
        sorteio: rnd.proximo(),
      },
    ])
  )
  return [...blocos].sort((x, y) => {
    const a = chave.get(x)
    const b = chave.get(y)
    return a.opcoes - b.opcoes || y.tam - x.tam || b.carga - a.carga || a.sorteio - b.sorteio
  })
}

export function construir(estado, rnd) {
  const pendentes = []
  for (const b of ordenarBlocos(estado, estado.ativos, rnd)) {
    if (!colocarGuloso(estado, b, rnd)) pendentes.push(b)
  }
  return pendentes
}

// Blocos que impedem b de ocupar os tempos hs: aulas do mesmo professor ou da
// mesma turma (salvo paralelas compatíveis). Aula fixada no caminho inviabiliza.
function bloqueadores(estado, b, hs) {
  const { inst, grade: g } = estado
  const encontrados = new Set()
  let fixa = false
  const anotar = (i) => {
    const id = estado.blocoDaAula[i]
    if (id < 0) fixa = true
    else encontrados.add(estado.blocos[id])
  }
  const grupo = inst.atrGrupo[b.a]
  for (const h of hs) {
    for (const p of inst.atrProfs[b.a]) for (const i of g.aulasDoProfessor(p, h)) anotar(i)
    for (const i of g.aulasDaTurma(inst.atrTurma[b.a], h)) {
      const outra = g.atr[i]
      if (grupo >= 0 && outra !== b.a && inst.atrGrupo[outra] === grupo) continue
      anotar(i)
    }
  }
  return { blocos: encontrados, fixa }
}

// Sala que pode ser liberada tirando no máximo `limite` blocos móveis.
function salaLiberavel(estado, b, hs, limite, travados) {
  const { grade: g, inst } = estado
  for (const s of inst.atrSalas[b.a]) {
    if (hs.some((h) => inst.indisp.sala[s * inst.H + h] === INDISPONIVEL)) continue
    const ocupantes = new Set()
    let possivel = true
    for (const h of hs) {
      for (const i of g.aulasDaSala(s, h)) {
        const id = estado.blocoDaAula[i]
        if (id < 0 || travados.has(estado.blocos[id])) possivel = false
        else ocupantes.add(estado.blocos[id])
      }
    }
    if (possivel && ocupantes.size <= limite) return { s, ocupantes }
  }
  return null
}

// Tenta encaixar b tirando até MAXIMO_DESLOCADOS blocos do caminho e
// realocando cada um (com nova cadeia, se a profundidade permitir).
function tentarDeslocar(estado, b, rnd, profundidade, travados) {
  for (const h0 of rnd.embaralhar(estado.dominio(b.a, b.tam))) {
    const hs = estado.tempos(h0, b.tam)
    const { blocos, fixa } = bloqueadores(estado, b, hs)
    if (fixa || blocos.size > MAXIMO_DESLOCADOS) continue
    if ([...blocos].some((c) => travados.has(c))) continue

    const marca = estado.marcar()
    for (const c of blocos) estado.posicionar(c, -1, -1)
    if (!estado.viavelSemSala(b, hs)) {
      estado.voltar(marca)
      continue
    }
    let s = estado.escolherSala(b, hs)
    if (s === SEM_SALA_LIVRE) {
      const livre = salaLiberavel(estado, b, hs, MAXIMO_DESLOCADOS - blocos.size, travados)
      if (!livre) {
        estado.voltar(marca)
        continue
      }
      for (const c of livre.ocupantes) {
        estado.posicionar(c, -1, -1)
        blocos.add(c)
      }
      s = livre.s
    }
    estado.posicionar(b, h0, s)

    const agoraTravados = new Set([...travados, b])
    const ok = [...blocos].every(
      (c) =>
        colocarGuloso(estado, c, rnd) ||
        (profundidade > 1 && tentarDeslocar(estado, c, rnd, profundidade - 1, agoraTravados))
    )
    if (ok) return true
    estado.voltar(marca)
  }
  return false
}

function encaixar(estado, b, rnd) {
  if (colocarGuloso(estado, b, rnd)) return true
  const marca = estado.marcar()
  const ok = tentarDeslocar(estado, b, rnd, PROFUNDIDADE_REPARO, new Set())
  if (!ok) estado.voltar(marca)
  return ok
}

// Reparo: para cada bloco sem lugar, tenta o deslocamento em cadeia. Se ainda
// assim não couber e tiver mais de uma aula, divide em aulas avulsas (a F1 cobra
// a separação) e tenta cada uma. O que sobrar fica fora da grade.
export function reparar(estado, pendentes, rnd) {
  const restantes = []
  for (const b of pendentes) {
    if (encaixar(estado, b, rnd)) continue
    if (b.tam === 1) {
      restantes.push(b)
      continue
    }
    b.ativo = false
    const avulsos = b.aulas.map((i) => {
      const novo = {
        id: estado.blocos.length,
        a: b.a,
        tam: 1,
        aulas: [i],
        h0: -1,
        s: -1,
        ativo: true,
      }
      estado.blocos.push(novo)
      return novo
    })
    estado.recalcularListas()
    for (const novo of avulsos) if (!encaixar(estado, novo, rnd)) restantes.push(novo)
  }
  estado.encerrarJornal()
  return restantes
}

// Explica por que um bloco não tem lugar: para cada posição possível, quais
// regras impedem, e em quantas posições cada motivo aparece.
export function diagnosticar(estado, b) {
  const { inst, grade: g } = estado
  const { H } = inst
  const t = inst.atrTurma[b.a]
  const turma = inst.rotuloRecurso('turma', t)
  const motivos = []
  if (inst.atrSemSalaCompativel[b.a]) {
    motivos.push(
      `R7: nenhuma sala do tipo "${inst.atrTipo[b.a]}" comporta ${inst.atrCapacidade[b.a]} alunos`
    )
  }
  const inicios = []
  for (let h = 0; h < H; h++)
    if (inst.turmaTurnos[t][inst.horTurno[h]] && estado.tempos(h, b.tam)) inicios.push(h)
  if (!inicios.length) {
    motivos.push(
      b.tam > 1
        ? `R5: a ${turma} não tem ${b.tam} tempos seguidos em turno permitido`
        : `R5: a ${turma} não tem horários em turno permitido`
    )
    return motivos
  }

  const contagem = new Map()
  const contar = (m) => contagem.set(m, (contagem.get(m) ?? 0) + 1)
  for (const h0 of inicios) {
    const hs = estado.tempos(h0, b.tam)
    const aqui = new Set()
    for (const h of hs) {
      for (const p of inst.atrProfs[b.a]) {
        const nome = inst.rotuloRecurso('professor', p)
        if (inst.indisp.professor[p * H + h] === INDISPONIVEL) aqui.add(`R6: ${nome} indisponível`)
        else if (!g.professorLivre(p, h)) aqui.add(`R1: ${nome} já tem aula`)
      }
      if (inst.indisp.turma[t * H + h] === INDISPONIVEL) aqui.add(`R6: ${turma} indisponível`)
      else if (!g.turmaAceita(b.a, h)) aqui.add(`R2: a ${turma} já tem aula`)
    }
    if (inst.S > 0 && estado.escolherSala(b, hs) === SEM_SALA_LIVRE)
      aqui.add('R3: nenhuma sala compatível livre')
    for (const m of aqui) contar(m)
  }
  const total = inicios.length
  const ordenados = [...contagem].sort((x, y) => y[1] - x[1])
  for (const [m, n] of ordenados) motivos.push(`${m} em ${n} de ${total} posições`)
  if (!ordenados.length)
    motivos.push('Há posição livre, mas o solver não chegou a ela; gere de novo ou aumente o tempo')
  return motivos
}
