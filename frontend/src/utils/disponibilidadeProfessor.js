// Situação de um professor em cada tempo de um horário, para a grade de consulta
// (modal "Horário do professor" do editor e da visualização):
//   ocupado      → já tem aula neste tempo ou num de outro turno que se cruza com ele
//                  no relógio (tempos sobrepostos, como no gerador);
//   indisponivel → marcado como indisponível na disponibilidade do horário;
//   evitar       → marcado como "prefere evitar";
//   livre        → nenhuma das anteriores: tempo liberado para o professor.

// "07:00" ou "07:00:00" → minutos desde a meia-noite; sem hora, null.
function minutos(hora) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function seCruzam(a, b) {
  if (a.diaSemana !== b.diaSemana) return false
  const [ia, fa, ib, fb] = [a.horaInicio, a.horaFim, b.horaInicio, b.horaFim].map(minutos)
  if (ia == null || fa == null || ib == null || fb == null) return false
  return ia < fb && ib < fa
}

// horarios: os da grade horária; itens: os da GET .../disponibilidade/professor/:id;
// aulas: as do professor no horário. → Map(horarioId → situação).
export function situacaoDoProfessor(horarios, itens, aulas) {
  const marcados = new Map(itens.map((i) => [i.horarioId, i.rigida ? 'indisponivel' : 'evitar']))
  const comAula = new Set(aulas.map((a) => a.horarioId))
  const ocupados = horarios.filter((h) => comAula.has(h.id))
  return new Map(
    horarios.map((h) => [
      h.id,
      comAula.has(h.id) || ocupados.some((o) => seCruzam(o, h))
        ? 'ocupado'
        : (marcados.get(h.id) ?? 'livre'),
    ])
  )
}

// Turnos com algum tempo livre ou "prefere evitar": aparecem no modal mesmo sem aula.
export function turnosComTempoLivre(horarios, situacao) {
  const turnos = new Set()
  for (const h of horarios) {
    const s = situacao.get(h.id)
    if (s === 'livre' || s === 'evitar') turnos.add(h.turnoId)
  }
  return [...turnos]
}
