<template>
  <div>
    <header class="mb-4">
      <RouterLink :to="{ name: 'periodos' }" class="small">&larr; Períodos letivos</RouterLink>
      <h1 class="h3 mb-0 mt-1">Turnos e tempos de aula</h1>
      <p class="text-body-secondary mb-0">
        Período {{ periodo?.nome }}. Os tempos definidos aqui se repetem em todos os dias letivos
        marcados.
      </p>
    </header>

    <div v-if="carregando" class="text-center py-5"><BSpinner /></div>

    <template v-else>
      <BAlert :model-value="!!erro" variant="danger">{{ erro }}</BAlert>
      <BAlert
        :model-value="!!sucesso"
        variant="success"
        dismissible
        @update:model-value="sucesso = ''"
      >
        {{ sucesso }}
      </BAlert>

      <BAlert :model-value="novaGrade" variant="info">
        Este período ainda não tem grade horária. Abaixo está a configuração atual de horários do
        campus; ajuste o que precisar e clique em <strong>Salvar grade horária</strong>.
      </BAlert>

      <BCard class="mb-3">
        <h2 class="h6">Dias letivos</h2>
        <BFormCheckboxGroup v-model="dias" :options="opcoesDias" />
      </BCard>

      <BCard v-for="(turno, i) in turnos" :key="i" class="mb-3">
        <div class="d-flex flex-wrap gap-2 align-items-end mb-3">
          <BFormGroup label="Turno" :label-for="`turno-${i}`" class="flex-grow-1 mb-0">
            <BFormInput :id="`turno-${i}`" v-model="turno.nome" placeholder="Matutino" />
          </BFormGroup>
          <BButton variant="outline-danger" size="sm" @click="turnos.splice(i, 1)"
            >Remover turno</BButton
          >
        </div>

        <BTableSimple small class="mb-2 tabela-tempos">
          <BThead>
            <BTr>
              <BTh>Tempo</BTh>
              <BTh>Início</BTh>
              <BTh>Fim</BTh>
              <BTh />
            </BTr>
          </BThead>
          <BTbody>
            <BTr v-for="(tempo, j) in turno.tempos" :key="j">
              <BTd class="align-middle">{{ j + 1 }}º</BTd>
              <BTd
                ><BFormInput
                  v-model="tempo.horaInicio"
                  type="time"
                  size="sm"
                  :aria-label="`Início do ${j + 1}º tempo`"
              /></BTd>
              <BTd
                ><BFormInput
                  v-model="tempo.horaFim"
                  type="time"
                  size="sm"
                  :aria-label="`Fim do ${j + 1}º tempo`"
              /></BTd>
              <BTd class="text-end">
                <BButton
                  variant="link"
                  size="sm"
                  class="text-danger"
                  @click="turno.tempos.splice(j, 1)"
                  >Remover</BButton
                >
              </BTd>
            </BTr>
          </BTbody>
        </BTableSimple>
        <BButton variant="outline-secondary" size="sm" @click="adicionarTempo(turno)"
          >Adicionar tempo</BButton
        >
      </BCard>

      <div class="d-flex flex-wrap gap-2">
        <BButton variant="outline-primary" @click="adicionarTurno">Adicionar turno</BButton>
        <BButton variant="primary" class="ms-auto" :disabled="salvando" @click="salvar">
          <BSpinner v-if="salvando" small class="me-2" />
          Salvar grade horária
        </BButton>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  BAlert,
  BButton,
  BCard,
  BFormCheckboxGroup,
  BFormGroup,
  BFormInput,
  BSpinner,
  BTableSimple,
  BThead,
  BTbody,
  BTr,
  BTh,
  BTd,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'

const props = defineProps({ id: { type: Number, required: true } })

const periodoStore = usePeriodoStore()
const periodo = computed(() => periodoStore.periodos.find((p) => p.id === props.id))

const opcoesDias = [
  { value: 1, text: 'Segunda' },
  { value: 2, text: 'Terça' },
  { value: 3, text: 'Quarta' },
  { value: 4, text: 'Quinta' },
  { value: 5, text: 'Sexta' },
  { value: 6, text: 'Sábado' },
]

const dias = ref([])
const turnos = ref([])
const carregando = ref(true)
const salvando = ref(false)
const erro = ref('')
const sucesso = ref('')
const novaGrade = ref(false)

function somarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number)
  const total = h * 60 + m + minutos
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function adicionarTempo(turno) {
  const ultimo = turno.tempos.at(-1)
  const inicio = ultimo?.horaFim ?? '07:00'
  turno.tempos.push({ horaInicio: inicio, horaFim: somarMinutos(inicio, 50) })
}

function adicionarTurno() {
  turnos.value.push({ nome: '', tempos: [] })
}

// Configuração atual de horários do campus, sugerida para um período sem grade horária.
// Cada par é [início, fim]; o intervalo fica entre o 3º e o 4º tempo de cada turno.
const HORARIOS_CAMPUS = [
  {
    nome: 'Matutino',
    tempos: [
      ['07:00', '07:50'],
      ['07:50', '08:40'],
      ['08:40', '09:30'],
      ['09:50', '10:40'],
      ['10:40', '11:30'],
      ['11:30', '12:20'],
    ],
  },
  {
    nome: 'Vespertino',
    tempos: [
      ['13:00', '13:50'],
      ['13:50', '14:40'],
      ['14:40', '15:30'],
      ['15:50', '16:40'],
      ['16:40', '17:30'],
      ['17:30', '18:20'],
    ],
  },
  {
    nome: 'Noturno',
    tempos: [
      ['18:30', '19:15'],
      ['19:15', '20:00'],
      ['20:00', '20:45'],
      ['21:00', '21:45'],
      ['21:45', '22:30'],
    ],
  },
]

function sugestao() {
  return HORARIOS_CAMPUS.map((t) => ({
    nome: t.nome,
    tempos: t.tempos.map(([horaInicio, horaFim]) => ({ horaInicio, horaFim })),
  }))
}

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    if (!periodoStore.periodos.length) await periodoStore.carregar()
    const grade = await http.get(`/periodos/${props.id}/grade-horaria`)
    novaGrade.value = !grade.turnos.length
    if (grade.turnos.length) {
      dias.value = grade.dias
      turnos.value = grade.turnos.map((t) => ({
        nome: t.nome,
        tempos: t.tempos.map((x) => ({ ...x })),
      }))
    } else {
      dias.value = [1, 2, 3, 4, 5]
      turnos.value = sugestao()
    }
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregando.value = false
  }
}

async function salvar() {
  salvando.value = true
  erro.value = ''
  sucesso.value = ''
  try {
    const corpo = {
      dias: dias.value,
      turnos: turnos.value.map((t, i) => ({ nome: t.nome.trim(), ordem: i + 1, tempos: t.tempos })),
    }
    const grade = await http.put(`/periodos/${props.id}/grade-horaria`, corpo)
    novaGrade.value = false
    sucesso.value = `Grade horária salva: ${grade.horarios.length} tempos de aula na semana.`
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    salvando.value = false
  }
}

watch(() => props.id, carregar, { immediate: true })
</script>

<style scoped>
.tabela-tempos {
  max-width: 520px;
}
</style>
