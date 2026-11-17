<template>
  <div>
    <header class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <RouterLink :to="{ name: 'versoes' }" class="small">← Horários</RouterLink>
        <h1 class="h3 mb-1">{{ versao?.nome ?? 'Horário' }}</h1>
        <div v-if="versao" class="d-flex flex-wrap gap-2 align-items-center small">
          <BBadge v-if="avaliacao" :variant="avaliacao.valida ? 'success' : 'danger'">
            {{ avaliacao.valida ? 'Válida' : `${avaliacao.custoRigido} violação(ões) rígida(s)` }}
          </BBadge>
          <span v-if="avaliacao">Pontuação {{ formatarNumero(avaliacao.pontuacao) }}</span>
          <span
            v-if="avaliacao && versao.pontuacao != null && versao.pontuacao !== avaliacao.pontuacao"
            class="text-body-secondary"
            title="Os dados ou os pesos mudaram desde a geração"
          >
            (na geração: {{ formatarNumero(versao.pontuacao) }})
          </span>
          <span class="text-body-secondary">
            · {{ versao.totalAulas }} aulas ·
            {{ versao.origem === 'solver' ? 'gerada' : 'manual' }} em
            {{ formatarDataHora(versao.criadaEm) }}
          </span>
          <BBadge v-if="versao.publicada" variant="primary">Publicado</BBadge>
        </div>
      </div>
      <div v-if="versao" class="d-flex gap-2">
        <RouterLink
          :to="{ name: 'horario-atribuicoes', params: { id } }"
          class="btn btn-sm btn-outline-secondary"
          >Atribuições</RouterLink
        >
        <RouterLink
          :to="{ name: 'comparar', query: { a: id } }"
          class="btn btn-sm btn-outline-secondary"
          >Comparar</RouterLink
        >
        <RouterLink
          v-if="!versao.publicada"
          :to="{ name: 'editor-versao', params: { id } }"
          class="btn btn-sm btn-primary"
          >Editar</RouterLink
        >
      </div>
    </header>

    <BAlert :model-value="!!erro" variant="danger">{{ erro }}</BAlert>
    <div v-if="carregando" class="text-center py-5"><BSpinner label="Carregando" /></div>

    <template v-else-if="versao && gradeHoraria">
      <BAlert v-for="a in avaliacao?.avisos ?? []" :key="a" :model-value="true" variant="warning">
        {{ a }}
      </BAlert>

      <div v-if="custosNaoZerados.length" class="d-flex flex-wrap gap-1 mb-3">
        <span
          v-for="c in custosNaoZerados"
          :key="c.codigo"
          class="badge"
          :class="c.codigo.startsWith('R') ? 'text-bg-danger' : 'text-bg-light border'"
          :title="nomes[c.codigo]"
        >
          {{ c.codigo }} {{ nomes[c.codigo] }}: {{ c.valor }}
        </span>
      </div>

      <BRow class="g-3">
        <BCol cols="12" xl="8">
          <BCard no-body>
            <div class="d-flex flex-wrap gap-2 align-items-center p-2 border-bottom">
              <BButtonGroup size="sm" aria-label="Visão da grade">
                <BButton
                  v-for="v in VISOES"
                  :key="v.valor"
                  :variant="visao === v.valor ? 'primary' : 'outline-primary'"
                  :pressed="visao === v.valor"
                  @click="trocarVisao(v.valor)"
                >
                  {{ v.rotulo }}
                </BButton>
              </BButtonGroup>
              <BFormSelect
                v-model="recursoId"
                size="sm"
                class="seletor-recurso"
                :options="opcoesRecurso"
                :aria-label="`Escolher ${visao}`"
              />
              <BButton
                size="sm"
                variant="outline-secondary"
                :disabled="indiceRecurso <= 0"
                aria-label="Anterior"
                @click="andar(-1)"
                >‹</BButton
              >
              <BButton
                size="sm"
                variant="outline-secondary"
                :disabled="indiceRecurso >= opcoesRecurso.length - 1"
                aria-label="Próximo"
                @click="andar(1)"
                >›</BButton
              >
              <span class="small text-body-secondary ms-auto"
                >{{ aulasVisiveis.length }} aulas</span
              >
            </div>
            <GradeSemanal
              :grade-horaria="gradeHoraria"
              :aulas="aulasVisiveis"
              :visao="visao"
              :destaque="destaque"
              :turnos-fixos="turnosFixos"
              :titulo="`Grade de ${rotuloRecurso}`"
              @selecionar="selecionarAula"
            />
          </BCard>
        </BCol>

        <BCol cols="12" xl="4">
          <BCard v-if="aulaSelecionada" class="mb-3" body-class="small">
            <div class="d-flex justify-content-between">
              <strong>{{ aulaSelecionada.sigla }} — {{ aulaSelecionada.disciplina }}</strong>
              <BCloseButton aria-label="Fechar detalhe" @click="limparSelecao" />
            </div>
            <div>Turma {{ aulaSelecionada.turma }}</div>
            <div>{{ aulaSelecionada.professores.map((p) => p.nome).join(', ') }}</div>
            <div>
              {{ aulaSelecionada.sala ?? 'Sem sala' }} ·
              {{ rotuloHorario(aulaSelecionada.horarioId) }}
            </div>
            <div v-if="aulaSelecionada.fixada" class="text-body-secondary">
              Fixada para as próximas gerações.
            </div>
            <div v-if="aulaSelecionada.revisar" class="text-warning-emphasis">
              Marcada para revisão depois de uma reimportação.
            </div>
            <div class="mt-2 fw-semibold">
              {{ violacoesDaAula.length ? 'Violações desta aula' : 'Nenhuma violação nesta aula.' }}
            </div>
            <ul class="mb-0 ps-3">
              <li v-for="(v, k) in violacoesDaAula" :key="k">{{ v.codigo }}: {{ v.mensagem }}</li>
            </ul>
          </BCard>

          <BCard header-tag="h2" header-class="h6 mb-0" header="Violações">
            <p class="small text-body-secondary">
              Avaliadas com as regras e os pesos atuais. Clique para ver na grade.
            </p>
            <PainelViolacoes
              :violacoes="avaliacao?.violacoes ?? []"
              :pertence-a-visao="pertenceAVisao"
              :pesos="pesos"
              :selecionada="violacaoSelecionada"
              @selecionar="selecionarViolacao"
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
  BBadge,
  BButton,
  BButtonGroup,
  BCard,
  BCloseButton,
  BCol,
  BFormSelect,
  BRow,
  BSpinner,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'
import GradeSemanal from '@/components/GradeSemanal.vue'
import PainelViolacoes from '@/components/PainelViolacoes.vue'
import { DIAS, formatarDataHora, formatarNumero } from '@/utils/formato'

const props = defineProps({ id: { type: Number, required: true } })

const VISOES = [
  { valor: 'turma', rotulo: 'Turma' },
  { valor: 'professor', rotulo: 'Professor' },
  { valor: 'sala', rotulo: 'Sala' },
]

const periodoStore = usePeriodoStore()
const rota = useRoute()
const router = useRouter()

const carregando = ref(false)
const erro = ref('')
const versao = ref(null)
const aulas = ref([])
const avaliacao = ref(null)
const gradeHoraria = ref(null)
const turmas = ref([])
const atribuicoes = ref([])
const restricoes = ref([])

const visao = ref(VISOES.some((v) => v.valor === rota.query.visao) ? rota.query.visao : 'turma')
const recursoId = ref(Number(rota.query.recurso) || null)
const destaque = ref(new Set())
const violacaoSelecionada = ref(-1)
const aulaSelecionada = ref(null)

async function carregar() {
  const periodoId = periodoStore.ativoId
  if (!periodoId) return
  carregando.value = true
  erro.value = ''
  const base = `/periodos/${periodoId}`
  try {
    const [v, a, grade, t, at, r] = await Promise.all([
      http.get(`${base}/versoes/${props.id}`),
      http.get(`${base}/versoes/${props.id}/aulas`),
      http.get(`${base}/grade-horaria`),
      http.get(`${base}/dados/turmas`),
      http.get(`${base}/dados/atribuicoes`),
      http.get(`${base}/restricoes`),
    ])
    versao.value = v
    aulas.value = a
    gradeHoraria.value = grade
    turmas.value = t
    atribuicoes.value = at
    restricoes.value = r
    if (!opcoesRecurso.value.some((o) => o.value === recursoId.value))
      recursoId.value = opcoesRecurso.value[0]?.value ?? null
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregando.value = false
  }
  // A avaliação pode demorar mais; a grade aparece antes.
  try {
    avaliacao.value = await http.get(`${base}/versoes/${props.id}/avaliacao`)
  } catch (e) {
    erro.value = `Não foi possível avaliar a versão: ${mensagemDeErro(e)}`
  }
}

watch(() => [props.id, periodoStore.ativoId], carregar, { immediate: true })

// ---------- Recursos de cada visão ----------
const professores = computed(() => {
  const mapa = new Map()
  for (const a of aulas.value) for (const p of a.professores) mapa.set(p.id, p.nome)
  return [...mapa].map(([id, nome]) => ({ id, nome })).sort((x, y) => x.nome.localeCompare(y.nome))
})
const salas = computed(() => {
  const mapa = new Map()
  for (const a of aulas.value) if (a.salaId) mapa.set(a.salaId, a.sala)
  return [...mapa].map(([id, nome]) => ({ id, nome })).sort((x, y) => x.nome.localeCompare(y.nome))
})

const opcoesRecurso = computed(() => {
  if (visao.value === 'turma') return turmas.value.map((t) => ({ value: t.id, text: t.codigo }))
  if (visao.value === 'professor')
    return professores.value.map((p) => ({ value: p.id, text: p.nome }))
  return salas.value.map((s) => ({ value: s.id, text: s.nome }))
})
const indiceRecurso = computed(() =>
  opcoesRecurso.value.findIndex((o) => o.value === recursoId.value)
)
const rotuloRecurso = computed(() => opcoesRecurso.value[indiceRecurso.value]?.text ?? '')

function andar(passo) {
  const proximo = opcoesRecurso.value[indiceRecurso.value + passo]
  if (proximo) recursoId.value = proximo.value
}

function trocarVisao(nova, id = null) {
  visao.value = nova
  recursoId.value = id ?? opcoesRecurso.value[0]?.value ?? null
}

watch([visao, recursoId], () => {
  router.replace({
    query: { ...rota.query, visao: visao.value, recurso: recursoId.value ?? undefined },
  })
})

function daVisao(a, tipo = visao.value, id = recursoId.value) {
  if (tipo === 'turma') return a.turmaId === id
  if (tipo === 'professor') return a.professores.some((p) => p.id === id)
  return a.salaId === id
}

const aulasVisiveis = computed(() => aulas.value.filter((a) => daVisao(a)))
const turnosFixos = computed(() =>
  visao.value === 'turma' ? (turmas.value.find((t) => t.id === recursoId.value)?.turnos ?? []) : []
)

// ---------- Violações ----------
const nomes = computed(() => Object.fromEntries(restricoes.value.map((r) => [r.codigo, r.nome])))
const pesos = computed(() => Object.fromEntries(restricoes.value.map((r) => [r.codigo, r.peso])))
const custosNaoZerados = computed(() =>
  Object.entries(avaliacao.value?.pontuacaoPorRestricao ?? {})
    .filter(([, valor]) => valor > 0)
    .map(([codigo, valor]) => ({ codigo, valor }))
)

const aulaPorId = computed(() => new Map(aulas.value.map((a) => [a.id, a])))
const turmaDaAtribuicao = computed(() => new Map(atribuicoes.value.map((a) => [a.id, a.turmaId])))

// Visão e recurso que melhor mostram uma violação.
function alvoDaViolacao(v) {
  const { tipo, id } = v.recurso ?? {}
  if (tipo === 'turma' || tipo === 'professor' || tipo === 'sala') return { tipo, id }
  const aula = v.aulas.map((x) => aulaPorId.value.get(x)).find(Boolean)
  const turma = aula?.turmaId ?? turmaDaAtribuicao.value.get(id)
  return turma ? { tipo: 'turma', id: turma } : null
}

function pertenceAVisao(v) {
  if (v.aulas.some((x) => aulasVisiveis.value.some((a) => a.id === x))) return true
  const alvo = alvoDaViolacao(v)
  return !!alvo && alvo.tipo === visao.value && alvo.id === recursoId.value
}

function selecionarViolacao(v, indice) {
  violacaoSelecionada.value = indice
  aulaSelecionada.value = null
  destaque.value = new Set(v.aulas)
  const alvo = alvoDaViolacao(v)
  if (alvo && (alvo.tipo !== visao.value || alvo.id !== recursoId.value))
    trocarVisao(alvo.tipo, alvo.id)
}

function selecionarAula(a) {
  aulaSelecionada.value = a
  violacaoSelecionada.value = -1
  destaque.value = new Set([a.id])
}

function limparSelecao() {
  aulaSelecionada.value = null
  destaque.value = new Set()
}

const violacoesDaAula = computed(() =>
  aulaSelecionada.value
    ? (avaliacao.value?.violacoes ?? []).filter((v) => v.aulas.includes(aulaSelecionada.value.id))
    : []
)

function rotuloHorario(horarioId) {
  const h = gradeHoraria.value?.horarios.find((x) => x.id === horarioId)
  if (!h) return ''
  const turno = gradeHoraria.value.turnos.find((t) => t.id === h.turnoId)?.nome ?? ''
  return `${DIAS[h.diaSemana]}, ${h.ordem}º tempo (${turno}), ${h.horaInicio}–${h.horaFim}`
}
</script>

<style scoped>
.seletor-recurso {
  width: auto;
  min-width: 12rem;
}
</style>
