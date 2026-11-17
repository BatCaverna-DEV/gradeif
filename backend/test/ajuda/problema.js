// Problema pequeno para os testes do núcleo, com grade de resultado conhecido.
//
// Três turnos (Matutino, Vespertino, Noturno) de quatro tempos, segunda a sexta.
// O id do horário é calculado por h(dia, turno, tempo).

export const h = (dia, turno, tempo) => (dia - 1) * 12 + (turno - 1) * 4 + tempo
export const M = 1
export const V = 2
export const N = 3

export function problemaBase(extra = {}) {
  const horarios = []
  for (let dia = 1; dia <= 5; dia++)
    for (let turno = 1; turno <= 3; turno++)
      for (let ordem = 1; ordem <= 4; ordem++)
        horarios.push({ id: h(dia, turno, ordem), turnoId: turno, diaSemana: dia, ordem })
  return {
    turnos: [
      { id: 1, nome: 'Matutino', ordem: 1 },
      { id: 2, nome: 'Vespertino', ordem: 2 },
      { id: 3, nome: 'Noturno', ordem: 3 },
    ],
    horarios,
    turmas: [
      { id: 1, codigo: 'INF1M', turnosPermitidos: [M], numeroAlunos: 30 },
      { id: 2, codigo: 'INF1N', turnosPermitidos: [N], numeroAlunos: 30 },
    ],
    professores: [
      { id: 1, nome: 'Ana' },
      { id: 2, nome: 'Bruno' },
      { id: 3, nome: 'Carla' },
    ],
    salas: [
      { id: 1, nome: 'Sala 1', tipo: 'sala', capacidade: 40 },
      { id: 2, nome: 'Sala 2', tipo: 'sala', capacidade: 40 },
      { id: 3, nome: 'Lab', tipo: 'laboratorio', capacidade: 20 },
    ],
    atribuicoes: [
      {
        id: 1,
        turmaId: 1,
        disciplinaId: 1,
        rotulo: 'INF1M · MAT',
        professores: [1],
        aulasSemanais: 4,
        tamanhoBloco: 2,
      },
      {
        id: 2,
        turmaId: 1,
        disciplinaId: 2,
        rotulo: 'INF1M · POR',
        professores: [2],
        aulasSemanais: 2,
      },
      // Turma dividida: metade no laboratório, metade em sala, no mesmo horário.
      {
        id: 3,
        turmaId: 1,
        disciplinaId: 3,
        rotulo: 'INF1M · PROG-A',
        professores: [2],
        aulasSemanais: 2,
        tipoAmbiente: 'laboratorio',
        grupoParalelo: 'divisao',
      },
      {
        id: 4,
        turmaId: 1,
        disciplinaId: 4,
        rotulo: 'INF1M · PROG-B',
        professores: [3],
        aulasSemanais: 2,
        grupoParalelo: 'divisao',
      },
      {
        id: 5,
        turmaId: 2,
        disciplinaId: 1,
        rotulo: 'INF1N · MAT',
        professores: [1],
        aulasSemanais: 4,
        tamanhoBloco: 2,
      },
    ],
    ...extra,
  }
}

// Aula no formato da solução.
export const aula = (atribuicaoId, dia, turno, tempo, salaId = 1) => ({
  atribuicaoId,
  horarioId: h(dia, turno, tempo),
  salaId,
})
