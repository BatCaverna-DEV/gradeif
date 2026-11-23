// Instância compilada do problema: o JSON validado vira arrays indexados por
// posição (0..n-1), para que grade, restrições e solver consultem tudo em tempo
// constante. Os ids originais só voltam a aparecer na saída.

import { CATALOGO, TIPO } from './restricoes/catalogo.js'
import { validarProblema } from './problema.js'

export class ErroProblema extends Error {
  constructor(mensagem, detalhes = []) {
    super(mensagem)
    this.name = 'ErroProblema'
    this.detalhes = detalhes
  }
}

const DIAS = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

// Mesmo critério da importação: minúsculo, sem acento, espaços simples.
export const normalizarTipo = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

// Valores das células de indisponibilidade.
export const INDISPONIVEL = 1
export const PREFERE_EVITAR = 2

function indexar(lista, nome, erros) {
  const mapa = new Map()
  lista.forEach((x, i) => {
    if (mapa.has(x.id)) erros.push(`${nome} ${x.id} aparece mais de uma vez`)
    mapa.set(x.id, i)
  })
  return mapa
}

function lancarSeHouver(erros) {
  if (erros.length) {
    const resumo = erros.length === 1 ? erros[0] : `${erros.length} problemas nos dados`
    throw new ErroProblema(`Problema inconsistente: ${resumo}`, erros)
  }
}

// Configuração efetiva de cada restrição: catálogo + o que veio no problema.
function montarConfig(restricoes) {
  const informadas = new Map(restricoes.map((r) => [r.codigo, r]))
  const config = {}
  for (const r of CATALOGO) {
    const i = informadas.get(r.codigo)
    config[r.codigo] = {
      codigo: r.codigo,
      rigida: r.tipo === TIPO.RIGIDA,
      ativa: i?.ativa ?? true,
      peso: r.tipo === TIPO.RIGIDA ? 1 : (i?.peso ?? r.peso),
      parametros: { ...(r.parametros ?? {}), ...(i?.parametros ?? {}) },
    }
  }
  return config
}

// "07:00" ou "07:00:00" → minutos desde a meia-noite; sem hora, null.
function minutos(hora) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

// Tempos que acontecem ao mesmo tempo no relógio. Turnos diferentes podem ter
// tempos de tamanhos diferentes no mesmo período do dia (Noturno com aulas de
// 45 min e Superior Noturno com aulas de 1 h, por exemplo): uma aula num deles
// ocupa o professor, a turma e a sala também nos tempos do outro que se cruzam.
// sobre[h] = índices dos outros horários do mesmo dia que se cruzam com h.
// Horários sem hora informada não se cruzam com nenhum.
const NENHUM = Object.freeze([])
function temposSobrepostos(horarios) {
  const H = horarios.length
  const sobre = new Array(H).fill(NENHUM)
  const inicio = horarios.map((h) => minutos(h.horaInicio))
  const fim = horarios.map((h) => minutos(h.horaFim))
  // Os horários estão ordenados por dia: compara só dentro de cada dia.
  let comeco = 0
  for (let i = 0; i <= H; i++) {
    if (i < H && horarios[i].diaSemana === horarios[comeco].diaSemana) continue
    for (let x = comeco; x < i; x++) {
      if (inicio[x] == null || fim[x] == null) continue
      for (let y = x + 1; y < i; y++) {
        if (inicio[y] == null || fim[y] == null) continue
        if (inicio[x] < fim[y] && inicio[y] < fim[x]) {
          if (sobre[x] === NENHUM) sobre[x] = []
          if (sobre[y] === NENHUM) sobre[y] = []
          sobre[x].push(y)
          sobre[y].push(x)
        }
      }
    }
    comeco = i
  }
  return sobre
}

// Turnos de noite e de manhã para a F3: pelos parâmetros ou pelo nome. Turnos
// que se cruzam no relógio com eles (Superior Noturno junto do Noturno, por
// exemplo) contam como noite ou manhã também.
function turnosDaInterjornada(turnos, horarios, horTurno, sobre, parametros) {
  const porId = (id) => turnos.findIndex((t) => t.id === id)
  const porNome = (re) => turnos.findIndex((t) => re.test(normalizarTipo(t.nome)))
  const noite = parametros.turnoNoite ? porId(parametros.turnoNoite) : porNome(/not|noite/)
  const manha = parametros.turnoManha ? porId(parametros.turnoManha) : porNome(/mat|manha/)
  if (noite < 0 || manha < 0 || noite === manha) return null
  const marcar = (base) => {
    const flags = new Uint8Array(turnos.length)
    flags[base] = 1
    horarios.forEach((_h, i) => {
      if (horTurno[i] !== base) return
      for (const j of sobre[i]) flags[horTurno[j]] = 1
    })
    return flags
  }
  const noites = marcar(noite)
  const manhas = marcar(manha)
  // Um turno que cruza os dois (improvável) fica só no seu próprio papel.
  manhas[noite] = 0
  noites[manha] = 0
  return { noite, manha, noites, manhas }
}

export function criarInstancia(entrada) {
  const p = validarProblema(entrada)
  const erros = []

  // ---------- Turnos e horários ----------
  const turnosBase = p.turnos.length
    ? p.turnos
    : [...new Set(p.horarios.map((h) => h.turnoId))].map((id) => ({
        id,
        nome: `Turno ${id}`,
        ordem: id,
      }))
  const turnos = [...turnosBase].sort((a, b) => a.ordem - b.ordem || a.id - b.id)
  const idxTurno = indexar(turnos, 'Turno', erros)
  for (const h of p.horarios)
    if (!idxTurno.has(h.turnoId)) erros.push(`Horário ${h.id}: turno ${h.turnoId} não existe`)
  lancarSeHouver(erros)

  // Ordem dos horários: dia, turno, tempo. Assim os horários de um mesmo turno e
  // dia ficam contíguos, e a ordem numérica dos índices é a ordem do relógio.
  const horarios = [...p.horarios].sort(
    (a, b) =>
      a.diaSemana - b.diaSemana ||
      idxTurno.get(a.turnoId) - idxTurno.get(b.turnoId) ||
      a.ordem - b.ordem
  )
  const H = horarios.length
  const idxHorario = indexar(horarios, 'Horário', erros)
  const horTurno = new Int16Array(H)
  const horDia = new Int8Array(H)
  const horOrdem = new Int16Array(H)
  const horSeq = new Int16Array(H) // posição dentro do turno e dia (0, 1, 2...)
  const prox = new Int32Array(H).fill(-1) // próximo tempo seguido no mesmo turno e dia
  horarios.forEach((h, i) => {
    horTurno[i] = idxTurno.get(h.turnoId)
    horDia[i] = h.diaSemana
    horOrdem[i] = h.ordem
    const anterior = i > 0 ? horarios[i - 1] : null
    if (anterior && anterior.diaSemana === h.diaSemana && anterior.turnoId === h.turnoId) {
      if (anterior.ordem === h.ordem)
        erros.push(`Horários ${anterior.id} e ${h.id} ocupam o mesmo tempo do turno`)
      horSeq[i] = horSeq[i - 1] + 1
      if (h.ordem === anterior.ordem + 1) prox[i - 1] = i
    }
  })
  const dias = [...new Set(horarios.map((h) => h.diaSemana))]
  const sobre = temposSobrepostos(horarios)

  // ---------- Recursos ----------
  const idxTurma = indexar(p.turmas, 'Turma', erros)
  const idxProfessor = indexar(p.professores, 'Professor', erros)
  const idxSala = indexar(p.salas, 'Sala', erros)
  const idxAtribuicao = indexar(p.atribuicoes, 'Atribuição', erros)
  const T = p.turmas.length
  const P = p.professores.length
  const S = p.salas.length
  const A = p.atribuicoes.length
  const nTurnos = turnos.length

  const turmaTurnos = p.turmas.map((t) => {
    const flags = new Uint8Array(nTurnos)
    for (const id of t.turnosPermitidos) {
      if (idxTurno.has(id)) flags[idxTurno.get(id)] = 1
      else erros.push(`Turma ${t.codigo}: turno ${id} não existe`)
    }
    return flags
  })
  const turmaAlunos = Int32Array.from(p.turmas, (t) => t.numeroAlunos)
  const salaTipo = p.salas.map((s) => normalizarTipo(s.tipo))
  const salaCapacidade = Int32Array.from(p.salas, (s) => s.capacidade)

  // ---------- Atribuições ----------
  const atrTurma = new Int32Array(A)
  const atrProfs = []
  const atrAulas = new Int16Array(A)
  const atrBloco = new Int16Array(A)
  const atrGrupo = new Int32Array(A).fill(-1) // grupo paralelo como número; -1 = sem grupo
  const atrTipo = []
  const grupos = new Map()
  const partesDoGrupo = new Map()
  p.atribuicoes.forEach((a, i) => {
    const t = idxTurma.get(a.turmaId)
    if (t === undefined) erros.push(`Atribuição ${a.id}: turma ${a.turmaId} não existe`)
    atrTurma[i] = t ?? 0
    atrProfs.push(
      a.professores.map((id) => {
        const ip = idxProfessor.get(id)
        if (ip === undefined) erros.push(`Atribuição ${a.id}: professor ${id} não existe`)
        return ip ?? 0
      })
    )
    atrAulas[i] = a.aulasSemanais
    atrBloco[i] = Math.max(1, Math.min(a.tamanhoBloco, a.aulasSemanais))
    atrTipo.push(normalizarTipo(a.tipoAmbiente))
    if (a.grupoParalelo) {
      const chave = `${a.turmaId}|${normalizarTipo(a.grupoParalelo)}`
      if (!grupos.has(chave)) grupos.set(chave, grupos.size)
      atrGrupo[i] = grupos.get(chave)
      partesDoGrupo.set(chave, (partesDoGrupo.get(chave) ?? 0) + 1)
    }
  })
  lancarSeHouver(erros)

  // Turma dividida em grupos paralelos: cada parte precisa de sala só para a sua fração.
  const atrCapacidade = Int32Array.from(p.atribuicoes, (a, i) => {
    const alunos = turmaAlunos[atrTurma[i]]
    if (!a.grupoParalelo) return alunos
    const partes = partesDoGrupo.get(`${a.turmaId}|${normalizarTipo(a.grupoParalelo)}`)
    return Math.ceil(alunos / partes)
  })

  // Salas que atendem cada atribuição (tipo e capacidade), da menor para a maior.
  // Sem nenhuma compatível, o solver usa as do mesmo tipo ou, por fim, todas, e a
  // R7 aponta o problema.
  const porCapacidade = [...Array(S).keys()].sort((x, y) => salaCapacidade[x] - salaCapacidade[y])
  const atrSalas = []
  const atrSemSalaCompativel = new Uint8Array(A)
  for (let a = 0; a < A; a++) {
    const compativeis = porCapacidade.filter(
      (s) => salaTipo[s] === atrTipo[a] && salaCapacidade[s] >= atrCapacidade[a]
    )
    if (compativeis.length || S === 0) {
      atrSalas.push(compativeis)
      continue
    }
    atrSemSalaCompativel[a] = 1
    const mesmoTipo = porCapacidade.filter((s) => salaTipo[s] === atrTipo[a])
    atrSalas.push(mesmoTipo.length ? mesmoTipo.reverse() : [...porCapacidade].reverse())
  }

  // ---------- Indisponibilidades ----------
  // Matriz recurso × horário: 0 livre, 1 indisponível (R6), 2 prefere evitar (F5).
  const indisp = {
    professor: new Uint8Array(P * H),
    turma: new Uint8Array(T * H),
    sala: new Uint8Array(S * H),
  }
  const idxPorTipo = { professor: idxProfessor, turma: idxTurma, sala: idxSala }
  for (const i of p.indisponibilidades) {
    const h = idxHorario.get(i.horarioId)
    if (h === undefined) {
      erros.push(`Indisponibilidade: horário ${i.horarioId} não existe`)
      continue
    }
    // Recurso fora do problema (professor inativo, por exemplo) não atrapalha.
    const r = idxPorTipo[i.tipoRecurso].get(i.recursoId)
    if (r === undefined) continue
    const atual = indisp[i.tipoRecurso][r * H + h]
    indisp[i.tipoRecurso][r * H + h] = i.rigida ? INDISPONIVEL : atual || PREFERE_EVITAR
  }
  // Professor e sala indisponíveis num tempo também estão nos tempos de outros
  // turnos que se cruzam com ele. (A da turma diz quais tempos do turno dela
  // estão abertos; não passa para outros turnos.)
  for (const [tipo, n] of [
    ['professor', P],
    ['sala', S],
  ]) {
    const original = indisp[tipo].slice()
    for (let r = 0; r < n; r++)
      for (let h = 0; h < H; h++) {
        const v = original[r * H + h]
        if (!v) continue
        for (const h2 of sobre[h]) {
          const k = r * H + h2
          if (v === INDISPONIVEL) indisp[tipo][k] = INDISPONIVEL
          else if (!indisp[tipo][k]) indisp[tipo][k] = PREFERE_EVITAR
        }
      }
  }

  // ---------- Aulas fixadas ----------
  const fixadas = []
  const fixadasPorAtr = Array.from({ length: A }, () => [])
  for (const f of p.aulasFixadas) {
    const a = idxAtribuicao.get(f.atribuicaoId)
    const h = idxHorario.get(f.horarioId)
    const s = f.salaId == null ? -1 : idxSala.get(f.salaId)
    if (a === undefined) erros.push(`Aula fixada: atribuição ${f.atribuicaoId} não existe`)
    if (h === undefined) erros.push(`Aula fixada: horário ${f.horarioId} não existe`)
    if (s === undefined) erros.push(`Aula fixada: sala ${f.salaId} não existe`)
    if (a === undefined || h === undefined || s === undefined) continue
    const fixada = { a, h, s }
    fixadas.push(fixada)
    fixadasPorAtr[a].push(fixada)
  }
  for (let a = 0; a < A; a++)
    if (fixadasPorAtr[a].length > atrAulas[a])
      erros.push(
        `Atribuição ${p.atribuicoes[a].id}: ${fixadasPorAtr[a].length} aulas fixadas para ${atrAulas[a]} aulas semanais`
      )
  lancarSeHouver(erros)

  const config = montarConfig(p.restricoes)

  const inst = {
    problema: p,
    config,
    H,
    T,
    P,
    S,
    A,
    turnos,
    horarios,
    dias,
    horTurno,
    horDia,
    horOrdem,
    horSeq,
    prox,
    turmaTurnos,
    turmaAlunos,
    salaTipo,
    salaCapacidade,
    atrTurma,
    atrProfs,
    atrAulas,
    atrBloco,
    atrGrupo,
    atrTipo,
    atrCapacidade,
    atrSalas,
    atrSemSalaCompativel,
    indisp,
    fixadas,
    fixadasPorAtr,
    sobre,
    temSobreposicao: sobre.some((s) => s.length > 0),
    interjornada: turnosDaInterjornada(turnos, horarios, horTurno, sobre, config.F3.parametros),
    idx: {
      horario: idxHorario,
      turma: idxTurma,
      professor: idxProfessor,
      sala: idxSala,
      atribuicao: idxAtribuicao,
    },
    tamanho: { professor: P, turma: T, sala: S, atribuicao: A },

    // ---------- Rótulos para mensagens ----------
    rotuloHorario(h) {
      const turno = turnos[horTurno[h]].nome
      return `${DIAS[horDia[h]]}, ${horOrdem[h]}º tempo (${turno})`
    },
    rotuloDia: (d) => DIAS[d],
    rotuloAtribuicao(a) {
      const atr = p.atribuicoes[a]
      return atr.rotulo ?? `${p.turmas[atrTurma[a]].codigo} · disciplina ${atr.disciplinaId}`
    },
    rotuloRecurso(tipo, r) {
      if (tipo === 'professor') return `professor ${p.professores[r].nome}`
      if (tipo === 'turma') return `turma ${p.turmas[r].codigo}`
      if (tipo === 'sala') return `sala ${p.salas[r].nome}`
      return inst.rotuloAtribuicao(r)
    },
    idRecurso(tipo, r) {
      const lista = {
        professor: p.professores,
        turma: p.turmas,
        sala: p.salas,
        atribuicao: p.atribuicoes,
      }[tipo]
      return lista[r].id
    },
  }
  return inst
}
