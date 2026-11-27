<!--
  Modal "Horário de Fulano", só para consulta: as aulas do professor em todas as
  turmas do horário e os tempos liberados para ele, segundo a disponibilidade do
  professor naquele horário. Aberto pelo cartão da aula escolhida no editor e na
  visualização.
-->
<template>
  <BModal
    v-model="visivel"
    :title="`Horário de ${professor?.nome ?? ''}`"
    size="xl"
    ok-only
    ok-title="Fechar"
    ok-variant="secondary"
  >
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2 small">
      <span class="text-body-secondary">
        {{ aulasDoProfessor.length }} aula(s) na semana neste horário<template v-if="situacao"
          >, {{ contagem.livre }} tempo(s) livre(s)<template v-if="contagem.evitar">
            e {{ contagem.evitar }} a evitar</template
          ></template
        >.
      </span>
      <LegendaDisponibilidadeProfessor v-if="situacao" class="ms-auto" />
    </div>
    <BAlert :model-value="!!erro" variant="warning" class="small py-2">{{ erro }}</BAlert>
    <div v-if="carregando" class="text-center py-3"><BSpinner small label="Carregando" /></div>
    <GradeSemanal
      v-else-if="visivel && professor"
      :grade-horaria="gradeHoraria"
      :aulas="aulasDoProfessor"
      visao="professor"
      :selecionada="selecionada"
      :situacao-professor="situacao"
      :turnos-abertos="turnosLivres"
      :compacta="compacta"
      :titulo="`Grade de ${professor.nome}`"
    />
  </BModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BAlert, BModal, BSpinner } from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'
import GradeSemanal from '@/components/GradeSemanal.vue'
import LegendaDisponibilidadeProfessor from '@/components/LegendaDisponibilidadeProfessor.vue'
import { situacaoDoProfessor, turnosComTempoLivre } from '@/utils/disponibilidadeProfessor'

const visivel = defineModel({ type: Boolean, default: false })
const props = defineProps({
  professor: { type: Object, default: null }, // { id, nome }
  versaoId: { type: Number, required: true },
  gradeHoraria: { type: Object, required: true },
  aulas: { type: Array, required: true }, // todas as aulas do horário
  selecionada: { type: Number, default: null },
  compacta: { type: Boolean, default: false },
})

const periodoStore = usePeriodoStore()
const itens = ref(null) // marcações da disponibilidade do professor neste horário
const carregando = ref(false)
const erro = ref('')

const aulasDoProfessor = computed(() =>
  props.professor
    ? props.aulas.filter((a) => a.professores.some((p) => p.id === props.professor.id))
    : []
)

const situacao = computed(() =>
  itens.value
    ? situacaoDoProfessor(props.gradeHoraria.horarios, itens.value, aulasDoProfessor.value)
    : null
)
const turnosLivres = computed(() =>
  situacao.value ? turnosComTempoLivre(props.gradeHoraria.horarios, situacao.value) : []
)
const contagem = computed(() => {
  const c = { livre: 0, evitar: 0 }
  for (const s of situacao.value?.values() ?? []) if (s in c) c[s]++
  return c
})

// A disponibilidade é lida a cada abertura: pode ter mudado desde a última.
async function carregar() {
  itens.value = null
  erro.value = ''
  if (!visivel.value || !props.professor) return
  carregando.value = true
  try {
    const r = await http.get(
      `/periodos/${periodoStore.ativoId}/disponibilidade/professor/${props.professor.id}?versao=${props.versaoId}`
    )
    itens.value = r.itens
  } catch (e) {
    erro.value = `Não foi possível ler a disponibilidade do professor: ${mensagemDeErro(e)}`
  } finally {
    carregando.value = false
  }
}

watch(() => [visivel.value, props.professor?.id], carregar)
</script>
