<template>
  <div>
    <header class="mb-3">
      <h1 class="h3 mb-0">Exportações</h1>
      <p class="text-body-secondary mb-0">
        PDF para o mural (uma página por turma, professor ou sala) e planilha com todas as aulas
        para lançar no SUAP.
      </p>
    </header>

    <BAlert v-if="!periodo" :model-value="true" variant="warning"
      >Selecione um período letivo.</BAlert
    >

    <template v-else>
      <BAlert :model-value="!!erro" variant="danger" dismissible @update:model-value="erro = ''">
        {{ erro }}
      </BAlert>

      <p v-if="!carregando && !versoes.length" class="text-body-secondary">
        Nenhum horário neste período.
        <RouterLink :to="{ name: 'geracao' }">Gere uma grade</RouterLink>
        primeiro.
      </p>

      <BCard v-else class="mb-3">
        <label for="versao" class="form-label">Horário</label>
        <BFormSelect id="versao" v-model="versaoId" :options="opcoesVersao" class="seletor" />
        <div v-if="versaoAtual && !versaoAtual.publicada" class="form-text text-warning-emphasis">
          Este horário não está publicado; o PDF sai marcado como versão de trabalho.
        </div>
      </BCard>

      <BRow v-if="versaoId" class="g-3">
        <BCol v-for="tipo in TIPOS" :key="tipo.valor" cols="12" md="6" xl="4">
          <BCard class="h-100" :header="tipo.titulo" header-tag="h2" header-class="h6 mb-0">
            <p class="small text-body-secondary">{{ tipo.descricao }}</p>
            <BButton
              variant="primary"
              size="sm"
              class="me-2 mb-2"
              :disabled="!!baixando"
              @click="baixar(urlPdf(tipo.valor), `pdf-${tipo.valor}`)"
            >
              <BSpinner v-if="baixando === `pdf-${tipo.valor}`" small class="me-1" />
              PDF de {{ tipo.todos }}
            </BButton>
            <div class="d-flex gap-2 align-items-center">
              <BFormSelect
                v-model="escolhido[tipo.valor]"
                size="sm"
                :options="[{ value: null, text: `Só um(a)…` }, ...recursos[tipo.valor]]"
                :aria-label="`Escolher ${tipo.valor}`"
              />
              <BButton
                size="sm"
                variant="outline-primary"
                :disabled="!escolhido[tipo.valor] || !!baixando"
                @click="baixar(urlPdf(tipo.valor, escolhido[tipo.valor]), `um-${tipo.valor}`)"
                >PDF</BButton
              >
            </div>
          </BCard>
        </BCol>

        <BCol cols="12" md="6" xl="4">
          <BCard class="h-100" header="Campus consolidado" header-tag="h2" header-class="h6 mb-0">
            <p class="small text-body-secondary">
              Capa com sumário e as grades de todas as turmas, professores e salas num só arquivo.
            </p>
            <BButton
              variant="primary"
              size="sm"
              :disabled="!!baixando"
              @click="baixar(urlPdf('campus'), 'campus')"
            >
              <BSpinner v-if="baixando === 'campus'" small class="me-1" />
              PDF do campus
            </BButton>
          </BCard>
        </BCol>

        <BCol cols="12" md="6" xl="4">
          <BCard class="h-100" header="Planilha para o SUAP" header-tag="h2" header-class="h6 mb-0">
            <p class="small text-body-secondary">
              Uma linha por aula: turma, disciplina, professores com SIAPE, dia, turno, tempo,
              horário e sala.
            </p>
            <BButton
              variant="primary"
              size="sm"
              :disabled="!!baixando"
              @click="baixar(`${base}/exportar/xlsx`, 'xlsx')"
            >
              <BSpinner v-if="baixando === 'xlsx'" small class="me-1" />
              Baixar XLSX
            </BButton>
          </BCard>
        </BCol>
      </BRow>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { BAlert, BButton, BCard, BCol, BFormSelect, BRow, BSpinner } from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'
import { baixarArquivo } from '@/utils/download'

const TIPOS = [
  {
    valor: 'turma',
    titulo: 'Por turma',
    todos: 'todas as turmas',
    descricao: 'Uma página por turma, com professor e sala em cada aula.',
  },
  {
    valor: 'professor',
    titulo: 'Por professor',
    todos: 'todos os professores',
    descricao: 'Uma página por professor, com turma e sala em cada aula.',
  },
  {
    valor: 'sala',
    titulo: 'Por sala',
    todos: 'todas as salas',
    descricao: 'Uma página por sala, para afixar na porta.',
  },
]

const periodoStore = usePeriodoStore()
const periodo = computed(() => periodoStore.ativo)
const rota = useRoute()

const versoes = ref([])
const versaoId = ref(null)
const aulas = ref([])
const carregando = ref(false)
const erro = ref('')
const baixando = ref('')
const escolhido = reactive({ turma: null, professor: null, sala: null })

const versaoAtual = computed(() => versoes.value.find((v) => v.id === versaoId.value))
const opcoesVersao = computed(() =>
  versoes.value.map((v) => ({ value: v.id, text: `${v.nome}${v.publicada ? ' (publicada)' : ''}` }))
)
const base = computed(() => `/api/periodos/${periodo.value?.id}/versoes/${versaoId.value}`)

watch(
  () => periodo.value?.id,
  async (id) => {
    versoes.value = []
    versaoId.value = null
    if (!id) return
    carregando.value = true
    try {
      versoes.value = await http.get(`/periodos/${id}/versoes`)
      const pedida = Number(rota.query.versao)
      versaoId.value =
        versoes.value.find((v) => v.id === pedida)?.id ??
        versoes.value.find((v) => v.publicada)?.id ??
        versoes.value[0]?.id ??
        null
    } catch (e) {
      erro.value = mensagemDeErro(e)
    } finally {
      carregando.value = false
    }
  },
  { immediate: true }
)

watch(versaoId, async (id) => {
  aulas.value = []
  Object.assign(escolhido, { turma: null, professor: null, sala: null })
  if (!id) return
  try {
    aulas.value = await http.get(`/periodos/${periodo.value.id}/versoes/${id}/aulas`)
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
})

// Turmas, professores e salas que têm aula na versão.
const recursos = computed(() => {
  const mapas = { turma: new Map(), professor: new Map(), sala: new Map() }
  for (const a of aulas.value) {
    mapas.turma.set(a.turmaId, a.turma)
    for (const p of a.professores) mapas.professor.set(p.id, p.nome)
    if (a.salaId) mapas.sala.set(a.salaId, a.sala)
  }
  const lista = (m) =>
    [...m].map(([value, text]) => ({ value, text })).sort((x, y) => x.text.localeCompare(y.text))
  return { turma: lista(mapas.turma), professor: lista(mapas.professor), sala: lista(mapas.sala) }
})

const urlPdf = (tipo, recurso = null) =>
  `${base.value}/exportar/pdf?tipo=${tipo}${recurso ? `&recurso=${recurso}` : ''}`

async function baixar(url, chave) {
  baixando.value = chave
  erro.value = ''
  try {
    await baixarArquivo(url)
  } catch (e) {
    erro.value = e.message
  } finally {
    baixando.value = ''
  }
}
</script>

<style scoped>
.seletor {
  max-width: 28rem;
}
</style>
