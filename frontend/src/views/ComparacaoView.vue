<template>
  <div>
    <header class="mb-3">
      <RouterLink :to="{ name: 'versoes' }" class="small">← Horários</RouterLink>
      <h1 class="h3 mb-0">Comparar horários</h1>
      <p class="text-body-secondary mb-0">
        Aulas destacadas não existem no outro horário no mesmo tempo de aula e na mesma sala.
      </p>
    </header>

    <BAlert :model-value="!!erro" variant="danger">{{ erro }}</BAlert>

    <BRow class="g-2 mb-3 align-items-end">
      <BCol cols="12" md="5">
        <label for="versao-a" class="form-label small mb-1">Horário A</label>
        <BFormSelect id="versao-a" v-model="idA" :options="opcoesVersoes" size="sm" />
      </BCol>
      <BCol cols="12" md="5">
        <label for="versao-b" class="form-label small mb-1">Horário B</label>
        <BFormSelect id="versao-b" v-model="idB" :options="opcoesVersoes" size="sm" />
      </BCol>
    </BRow>

    <div v-if="carregando" class="text-center py-5"><BSpinner label="Carregando" /></div>

    <template v-else-if="gradeHoraria && aulasA && aulasB">
      <BCard class="mb-3" body-class="small">
        <template v-if="!soA.size && !soB.size"
          >Os dois horários têm exatamente as mesmas aulas.</template
        >
        <template v-else>
          <strong>{{ soA.size }}</strong> aula(s) só em A e <strong>{{ soB.size }}</strong> só em B.
          <span v-if="turmasAlteradas.length">
            Turmas com mudança:
            <button
              v-for="t in turmasAlteradas"
              :key="t.id"
              type="button"
              class="btn btn-link btn-sm p-0 me-2 align-baseline"
              @click="trocarVisao('turma', t.id)"
            >
              {{ t.codigo }} ({{ t.n }})
            </button>
          </span>
        </template>
      </BCard>

      <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
        <BButtonGroup size="sm" aria-label="Visão da grade">
          <BButton
            v-for="v in VISOES"
            :key="v.valor"
            :variant="visao === v.valor ? 'primary' : 'outline-primary'"
            :pressed="visao === v.valor"
            @click="trocarVisao(v.valor)"
            >{{ v.rotulo }}</BButton
          >
        </BButtonGroup>
        <BFormSelect
          v-model="recursoId"
          size="sm"
          class="seletor-recurso"
          :options="opcoesRecurso"
          :aria-label="`Escolher ${visao}`"
        />
      </div>

      <BRow class="g-3">
        <BCol v-for="lado in lados" :key="lado.rotulo" cols="12" xxl="6">
          <BCard no-body>
            <div class="p-2 border-bottom small fw-semibold">
              {{ lado.rotulo }}: {{ nomeVersao(lado.id) }}
            </div>
            <GradeSemanal
              :grade-horaria="gradeHoraria"
              :aulas="lado.aulas.filter(daVisao)"
              :visao="visao"
              :destaque="lado.diferentes"
              :turnos-fixos="turnosFixos"
              :titulo="`${lado.rotulo}: ${rotuloRecurso}`"
            />
          </BCard>
        </BCol>
      </BRow>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BAlert,
  BButton,
  BButtonGroup,
  BCard,
  BCol,
  BFormSelect,
  BRow,
  BSpinner,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'
import GradeSemanal from '@/components/GradeSemanal.vue'

const VISOES = [
  { valor: 'turma', rotulo: 'Turma' },
  { valor: 'professor', rotulo: 'Professor' },
  { valor: 'sala', rotulo: 'Sala' },
]

const periodoStore = usePeriodoStore()
const rota = useRoute()
const router = useRouter()

const versoes = ref([])
const idA = ref(Number(rota.query.a) || null)
const idB = ref(Number(rota.query.b) || null)
const aulasA = ref(null)
const aulasB = ref(null)
const gradeHoraria = ref(null)
const turmas = ref([])
const carregando = ref(false)
const erro = ref('')
const visao = ref('turma')
const recursoId = ref(null)

const periodo = computed(() => `/periodos/${periodoStore.ativoId}`)
const opcoesVersoes = computed(() => [
  { value: null, text: 'Escolha…', disabled: true },
  ...versoes.value.map((v) => ({
    value: v.id,
    text: `${v.nome}${v.publicada ? ' (publicada)' : ''}`,
  })),
])
const nomeVersao = (id) => versoes.value.find((v) => v.id === id)?.nome ?? ''

watch(
  () => periodoStore.ativoId,
  async (id) => {
    if (!id) return
    try {
      const [lista, grade, t] = await Promise.all([
        http.get(`${periodo.value}/versoes`),
        http.get(`${periodo.value}/grade-horaria`),
        http.get(`${periodo.value}/dados/turmas`),
      ])
      versoes.value = lista
      gradeHoraria.value = grade
      turmas.value = t
      // Sem B escolhida, compara com a versão mais recente que não seja A.
      if (!idA.value) idA.value = lista[0]?.id ?? null
      if (!idB.value) idB.value = lista.find((v) => v.id !== idA.value)?.id ?? null
      if (!recursoId.value) recursoId.value = t[0]?.id ?? null
    } catch (e) {
      erro.value = mensagemDeErro(e)
    }
  },
  { immediate: true }
)

watch(
  [idA, idB],
  async ([a, b]) => {
    router.replace({ query: { a: a ?? undefined, b: b ?? undefined } })
    if (!a || !b) return
    carregando.value = true
    erro.value = ''
    try {
      ;[aulasA.value, aulasB.value] = await Promise.all([
        http.get(`${periodo.value}/versoes/${a}/aulas`),
        http.get(`${periodo.value}/versoes/${b}/aulas`),
      ])
    } catch (e) {
      erro.value = mensagemDeErro(e)
    } finally {
      carregando.value = false
    }
  },
  { immediate: true }
)

// Aulas de uma lista sem par na outra (mesma atribuição, horário e sala).
const chave = (a) => `${a.atribuicaoId}|${a.horarioId}|${a.salaId ?? ''}`
function semPar(lista, outra) {
  const contagem = new Map()
  for (const a of outra) contagem.set(chave(a), (contagem.get(chave(a)) ?? 0) + 1)
  const resultado = new Set()
  for (const a of lista) {
    const n = contagem.get(chave(a)) ?? 0
    if (n > 0) contagem.set(chave(a), n - 1)
    else resultado.add(a.id)
  }
  return resultado
}
const soA = computed(() => semPar(aulasA.value ?? [], aulasB.value ?? []))
const soB = computed(() => semPar(aulasB.value ?? [], aulasA.value ?? []))
const lados = computed(() => [
  { rotulo: 'A', id: idA.value, aulas: aulasA.value ?? [], diferentes: soA.value },
  { rotulo: 'B', id: idB.value, aulas: aulasB.value ?? [], diferentes: soB.value },
])

const turmasAlteradas = computed(() => {
  const n = new Map()
  for (const a of aulasA.value ?? [])
    if (soA.value.has(a.id)) n.set(a.turmaId, (n.get(a.turmaId) ?? 0) + 1)
  for (const a of aulasB.value ?? [])
    if (soB.value.has(a.id)) n.set(a.turmaId, (n.get(a.turmaId) ?? 0) + 1)
  return turmas.value
    .filter((t) => n.has(t.id))
    .map((t) => ({ id: t.id, codigo: t.codigo, n: n.get(t.id) }))
})

// ---------- Visão ----------
const todas = computed(() => [...(aulasA.value ?? []), ...(aulasB.value ?? [])])
const opcoesRecurso = computed(() => {
  if (visao.value === 'turma') return turmas.value.map((t) => ({ value: t.id, text: t.codigo }))
  const mapa = new Map()
  for (const a of todas.value) {
    if (visao.value === 'professor') for (const p of a.professores) mapa.set(p.id, p.nome)
    else if (a.salaId) mapa.set(a.salaId, a.sala)
  }
  return [...mapa]
    .map(([value, text]) => ({ value, text }))
    .sort((x, y) => x.text.localeCompare(y.text))
})
const rotuloRecurso = computed(
  () => opcoesRecurso.value.find((o) => o.value === recursoId.value)?.text ?? ''
)
const turnosFixos = computed(() =>
  visao.value === 'turma' ? (turmas.value.find((t) => t.id === recursoId.value)?.turnos ?? []) : []
)

function trocarVisao(nova, id = null) {
  visao.value = nova
  recursoId.value = id ?? opcoesRecurso.value[0]?.value ?? null
}

function daVisao(a) {
  if (visao.value === 'turma') return a.turmaId === recursoId.value
  if (visao.value === 'professor') return a.professores.some((p) => p.id === recursoId.value)
  return a.salaId === recursoId.value
}
</script>

<style scoped>
.seletor-recurso {
  width: auto;
  min-width: 12rem;
}
</style>
