<!-- Grade em lista por dia, para telas estreitas (consulta pública no celular). -->
<template>
  <div>
    <section v-for="dia in porDia" :key="dia.numero" class="mb-3">
      <h3 class="h6 border-bottom pb-1 mb-2">{{ DIAS[dia.numero] }}</h3>
      <p v-if="!dia.itens.length" class="small text-body-secondary mb-0">Sem aulas.</p>
      <ul v-else class="list-unstyled mb-0">
        <li v-for="item in dia.itens" :key="item.aula.id" class="d-flex gap-2 py-1 border-bottom">
          <div class="horario small text-body-secondary">
            <div class="fw-semibold text-body">{{ item.h.ordem }}º · {{ item.turno }}</div>
            {{ item.h.horaInicio }}–{{ item.h.horaFim }}
          </div>
          <div
            class="small ps-2"
            :style="
              item.aula.professores[0]?.cor
                ? { borderLeft: `4px solid ${item.aula.professores[0].cor}` }
                : undefined
            "
          >
            <div>
              <strong>{{ item.aula.sigla }}</strong> — {{ item.aula.disciplina }}
            </div>
            <div class="text-body-secondary">{{ detalhe(item.aula) }}</div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { DIAS } from '@/utils/formato'

const props = defineProps({
  gradeHoraria: { type: Object, required: true },
  aulas: { type: Array, required: true },
  visao: { type: String, default: 'turma' },
})

const porDia = computed(() => {
  const horario = new Map(props.gradeHoraria.horarios.map((h) => [h.id, h]))
  const turno = new Map(props.gradeHoraria.turnos.map((t) => [t.id, t]))
  return props.gradeHoraria.dias.map((numero) => ({
    numero,
    itens: props.aulas
      .map((aula) => ({ aula, h: horario.get(aula.horarioId) }))
      .filter((i) => i.h?.diaSemana === numero)
      .sort(
        (x, y) =>
          turno.get(x.h.turnoId).ordem - turno.get(y.h.turnoId).ordem || x.h.ordem - y.h.ordem
      )
      .map((i) => ({ ...i, turno: turno.get(i.h.turnoId).nome })),
  }))
})

const professores = (a) => a.professores.map((p) => p.nome).join(', ')

function detalhe(a) {
  if (props.visao === 'turma') return [professores(a), a.sala].filter(Boolean).join(' · ')
  if (props.visao === 'professor') return [`Turma ${a.turma}`, a.sala].filter(Boolean).join(' · ')
  return [`Turma ${a.turma}`, professores(a)].filter(Boolean).join(' · ')
}
</script>

<style scoped>
.horario {
  min-width: 6.5rem;
}
</style>
