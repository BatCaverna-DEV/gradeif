// Gera um problema fictício com o porte de um campus, para testar o solver e
// demonstrar a linha de comando sem depender do banco. Dados determinísticos.
//
// Estrutura: turnos matutino e vespertino (5 tempos) e noturno (4 tempos), de
// segunda a sexta. Turmas do integrado de manhã ou à tarde com 24 aulas; turmas
// do subsequente à noite com 16 aulas. Uma sala por turma, laboratórios e quadra.

import { criarAleatorio } from '../src/core/aleatorio.js'

const INTEGRADO = [
  // sigla, aulas, bloco, ambiente
  ['POR', 4, 2, 'sala'],
  ['MAT', 4, 2, 'sala'],
  ['FIS', 2, 2, 'sala'],
  ['QUI', 2, 2, 'sala'],
  ['BIO', 2, 2, 'sala'],
  ['HIS', 2, 1, 'sala'],
  ['GEO', 2, 1, 'sala'],
  ['ING', 2, 2, 'sala'],
  ['EDF', 2, 2, 'quadra'],
  ['INF', 2, 2, 'laboratorio de informatica'],
]

const SUBSEQUENTE = [
  ['ALG', 4, 2, 'laboratorio de informatica'],
  ['BDD', 4, 2, 'laboratorio de informatica'],
  ['RED', 4, 2, 'sala'],
  ['EMP', 2, 1, 'sala'],
  ['ETI', 2, 1, 'sala'],
]

export function gerarProblemaFicticio({
  turmasIntegrado = 12,
  turmasSubsequente = 4,
  semente = 'ficticio',
  opcoes = {},
} = {}) {
  const rnd = criarAleatorio(semente)
  const turnos = [
    { id: 1, nome: 'Matutino', ordem: 1, tempos: 5 },
    { id: 2, nome: 'Vespertino', ordem: 2, tempos: 5 },
    { id: 3, nome: 'Noturno', ordem: 3, tempos: 4 },
  ]
  const horarios = []
  for (const t of turnos)
    for (let dia = 1; dia <= 5; dia++)
      for (let ordem = 1; ordem <= t.tempos; ordem++)
        horarios.push({ id: horarios.length + 1, turnoId: t.id, diaSemana: dia, ordem })

  const turmas = []
  for (let k = 0; k < turmasIntegrado; k++) {
    const turno = k % 2 === 0 ? 1 : 2
    turmas.push({
      id: turmas.length + 1,
      codigo: `INT${Math.floor(k / 2) + 1}${turno === 1 ? 'M' : 'V'}`,
      turnosPermitidos: [turno],
      numeroAlunos: 30 + rnd.inteiro(10),
      grade: INTEGRADO,
    })
  }
  for (let k = 0; k < turmasSubsequente; k++) {
    turmas.push({
      id: turmas.length + 1,
      codigo: `SUB${k + 1}N`,
      turnosPermitidos: [3],
      numeroAlunos: 25 + rnd.inteiro(10),
      grade: SUBSEQUENTE,
    })
  }

  // Professores por disciplina: cada um com até 16 aulas daquela disciplina.
  const disciplinas = [...INTEGRADO, ...SUBSEQUENTE].map(([sigla], i) => ({ id: i + 1, sigla }))
  const idDisciplina = new Map(disciplinas.map((d) => [d.sigla, d.id]))
  const professores = []
  const fila = new Map()
  for (const [sigla, aulas] of [...INTEGRADO, ...SUBSEQUENTE]) {
    const total = turmas.filter((t) => t.grade.some((d) => d[0] === sigla)).length * aulas
    const quantos = Math.max(1, Math.ceil(total / 16))
    const ids = []
    for (let k = 0; k < quantos; k++) {
      const id = professores.length + 1
      professores.push({ id, nome: `Prof. ${sigla} ${k + 1}`, cargaMaximaSemanal: 20 })
      ids.push(id)
    }
    fila.set(sigla, { ids, proximo: 0, carga: new Map(ids.map((i) => [i, 0])) })
  }

  const atribuicoes = []
  for (const t of turmas) {
    for (const [sigla, aulas, bloco, ambiente] of t.grade) {
      const f = fila.get(sigla)
      // Professor menos carregado da disciplina.
      const prof = [...f.carga].sort((x, y) => x[1] - y[1])[0][0]
      f.carga.set(prof, f.carga.get(prof) + aulas)
      atribuicoes.push({
        id: atribuicoes.length + 1,
        turmaId: t.id,
        disciplinaId: idDisciplina.get(sigla),
        rotulo: `${t.codigo} · ${sigla}`,
        tipoAmbiente: ambiente,
        professores: [prof],
        aulasSemanais: aulas,
        tamanhoBloco: bloco,
      })
    }
  }

  const salas = turmas.map((t, i) => ({
    id: i + 1,
    nome: `Sala ${i + 1}`,
    tipo: 'sala',
    capacidade: 40,
  }))
  salas.push({
    id: salas.length + 1,
    nome: 'Lab. Informática 1',
    tipo: 'laboratorio de informatica',
    capacidade: 40,
  })
  salas.push({
    id: salas.length + 1,
    nome: 'Lab. Informática 2',
    tipo: 'laboratorio de informatica',
    capacidade: 40,
  })
  salas.push({ id: salas.length + 1, nome: 'Quadra', tipo: 'quadra', capacidade: 80 })

  // Alguns professores indisponíveis numa manhã e outros que preferem evitar a sexta.
  const indisponibilidades = []
  for (const p of professores) {
    const r = rnd.proximo()
    if (r < 0.15) {
      const dia = 1 + rnd.inteiro(5)
      for (const h of horarios)
        if (h.diaSemana === dia && h.turnoId === 1)
          indisponibilidades.push({
            tipoRecurso: 'professor',
            recursoId: p.id,
            horarioId: h.id,
            rigida: true,
          })
    } else if (r < 0.3) {
      for (const h of horarios)
        if (h.diaSemana === 5)
          indisponibilidades.push({
            tipoRecurso: 'professor',
            recursoId: p.id,
            horarioId: h.id,
            rigida: false,
          })
    }
  }

  return {
    turnos: turnos.map(({ id, nome, ordem }) => ({ id, nome, ordem })),
    horarios,
    turmas: turmas.map(({ grade: _g, ...t }) => t),
    professores,
    salas,
    atribuicoes,
    indisponibilidades,
    restricoes: [],
    aulasFixadas: [],
    opcoes: { semente: '1', tempoLimiteMs: 10_000, ...opcoes },
  }
}
