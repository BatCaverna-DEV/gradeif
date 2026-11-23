// Tempos em que uma turma pode ter aula num horário: o turno é um dos permitidos
// da turma (Dados) e o tempo não está marcado como indisponível na disponibilidade
// daquele horário. É a mesma regra do gerador; o editor e a visualização usam
// para mostrar os turnos da turma e bloquear os tempos fechados.

// Resposta de GET .../disponibilidade/turmas → Map(turmaId → Set(horarioId)).
export function mapaDeIndisponiveis(resposta) {
  return new Map((resposta?.turmas ?? []).map((t) => [t.turmaId, new Set(t.horarios)]))
}

// Tempos fechados da turma: turno não permitido ou marcado como indisponível.
export function temposFechados(turma, horarios, indisponiveis) {
  const permitidos = new Set(turma?.turnos ?? [])
  const marcados = indisponiveis?.get(turma?.id) ?? new Set()
  return new Set(
    horarios.filter((h) => !permitidos.has(h.turnoId) || marcados.has(h.id)).map((h) => h.id)
  )
}

// Turnos com pelo menos um tempo aberto para a turma.
export function turnosAbertos(turma, horarios, indisponiveis) {
  const fechados = temposFechados(turma, horarios, indisponiveis)
  return new Set(horarios.filter((h) => !fechados.has(h.id)).map((h) => h.turnoId))
}
