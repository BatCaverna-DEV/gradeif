<!--
  F5-06 — Consulta pública, sem login: grade publicada por turma, professor ou sala.
  O endereço guarda a escolha (/consulta/periodo/tipo/id), para enviar o link direto.
-->
<template>
  <div class="min-vh-100 bg-body-tertiary">
    <header class="topo-publico">
      <RouterLink :to="{ name: 'consulta' }" class="marca">
        <img :src="logo" alt="GradeIF — Sistema de Geração de Horário Escolar" />
      </RouterLink>
      <span class="campus d-none d-md-inline">IFMA Campus Coelho Neto</span>
      <RouterLink :to="{ name: 'login' }" class="btn btn-sm btn-primary ms-auto">
        <i class="bi bi-box-arrow-in-right me-1" aria-hidden="true" />Entrar
      </RouterLink>
    </header>

    <BContainer fluid class="py-4 conteudo">
      <h1 class="h3 mb-1">Consulta de horários</h1>
      <p class="text-body-secondary mb-4">
        Escolha o período e veja a grade publicada por turma, professor ou sala.
      </p>

      <BAlert :model-value="!!erro" variant="danger">{{ erro }}</BAlert>

      <div v-if="!carregando && !periodos.length && !erro" class="vazio">
        <i class="bi bi-calendar2-x" aria-hidden="true" />
        <h2 class="h5 mb-1">Nenhum horário publicado no momento</h2>
        <p class="text-body-secondary mb-0">
          Quando a coordenação publicar a grade do período, ela aparece aqui.
        </p>
      </div>

      <BRow v-if="periodos.length" class="g-2 mb-3 align-items-end">
        <BCol cols="12" sm="6" lg="3">
          <label for="periodo" class="form-label small mb-1">Período</label>
          <BFormSelect id="periodo" v-model="periodoId" :options="opcoesPeriodo" />
        </BCol>
        <BCol cols="12" sm="6" lg="3">
          <span id="rotulo-tipo" class="form-label small mb-1 d-block">Ver por</span>
          <BButtonGroup class="w-100" aria-labelledby="rotulo-tipo">
            <BButton
              v-for="v in VISOES"
              :key="v.valor"
              :variant="tipo === v.valor ? 'primary' : 'outline-primary'"
              :pressed="tipo === v.valor"
              @click="trocarTipo(v.valor)"
              >{{ v.rotulo }}</BButton
            >
          </BButtonGroup>
        </BCol>
        <BCol cols="12" sm="6" lg="3">
          <label for="recurso" class="form-label small mb-1">{{ rotuloTipo }}</label>
          <BFormSelect id="recurso" v-model="recursoId" :options="opcoesRecurso" />
        </BCol>
        <BCol cols="12" sm="6" lg="3" class="d-flex gap-2">
          <BButton
            variant="outline-secondary"
            :disabled="!recursoId || baixando"
            @click="baixarPdf"
          >
            <BSpinner v-if="baixando" small class="me-1" />PDF
          </BButton>
          <BButton variant="outline-secondary" :disabled="!recursoId" @click="copiarLink">
            {{ copiado ? 'Link copiado' : 'Copiar link' }}
          </BButton>
          <BButton
            variant="outline-secondary"
            class="d-none d-md-inline-block"
            :pressed="emLista"
            @click="emLista = !emLista"
            >{{ emLista ? 'Ver em tabela' : 'Ver em lista' }}</BButton
          >
        </BCol>
      </BRow>

      <div v-if="carregando" class="text-center py-5"><BSpinner label="Carregando" /></div>

      <BCard v-else-if="dados && recursoId" no-body>
        <div class="p-2 border-bottom small d-flex flex-wrap justify-content-between gap-2">
          <strong>{{ rotuloTipo }} {{ nomeRecurso }}</strong>
          <span class="text-body-secondary"
            >{{ dados.versao.nome
            }}<template v-if="dados.versao.publicadaEm">
              · publicada em {{ formatarDataHora(dados.versao.publicadaEm) }}</template
            ></span
          >
        </div>
        <GradeLista
          v-if="usarLista"
          class="p-2"
          :grade-horaria="dados.gradeHoraria"
          :aulas="aulasVisiveis"
          :visao="tipo"
        />
        <GradeSemanal
          v-else
          :grade-horaria="dados.gradeHoraria"
          :aulas="aulasVisiveis"
          :visao="tipo"
          :turnos-fixos="turnosFixos"
          :titulo="`Horário de ${nomeRecurso}`"
        />
      </BCard>
    </BContainer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BAlert,
  BButton,
  BButtonGroup,
  BCard,
  BCol,
  BContainer,
  BFormSelect,
  BRow,
  BSpinner,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro, urlDaApi } from '@/api/http'
import GradeSemanal from '@/components/GradeSemanal.vue'
import GradeLista from '@/components/GradeLista.vue'
import { formatarDataHora } from '@/utils/formato'
import { baixarArquivo } from '@/utils/download'
import logo from '@/assets/logo-gradeif.webp'

const VISOES = [
  { valor: 'turma', rotulo: 'Turma' },
  { valor: 'professor', rotulo: 'Professor' },
  { valor: 'sala', rotulo: 'Sala' },
]

const rota = useRoute()
const router = useRouter()

const periodos = ref([])
const dados = ref(null)
const carregando = ref(false)
const erro = ref('')
const baixando = ref(false)
const copiado = ref(false)

const periodoId = ref(Number(rota.params.periodoId) || null)
const tipo = ref(VISOES.some((v) => v.valor === rota.params.tipo) ? rota.params.tipo : 'turma')
const recursoId = ref(Number(rota.params.recursoId) || null)

const opcoesPeriodo = computed(() => periodos.value.map((p) => ({ value: p.id, text: p.nome })))
const rotuloTipo = computed(() => VISOES.find((v) => v.valor === tipo.value).rotulo)
const opcoesRecurso = computed(() => [
  { value: null, text: 'Escolha…', disabled: true },
  ...(dados.value?.recursos[tipo.value] ?? []).map((r) => ({ value: r.id, text: r.nome })),
])
const nomeRecurso = computed(
  () => dados.value?.recursos[tipo.value].find((r) => r.id === recursoId.value)?.nome ?? ''
)
const turnosFixos = computed(() =>
  tipo.value === 'turma'
    ? (dados.value?.recursos.turma.find((t) => t.id === recursoId.value)?.turnos ?? [])
    : []
)
const aulasVisiveis = computed(() =>
  (dados.value?.aulas ?? []).filter((a) => {
    if (tipo.value === 'turma') return a.turmaId === recursoId.value
    if (tipo.value === 'professor') return a.professores.some((p) => p.id === recursoId.value)
    return a.salaId === recursoId.value
  })
)

// Celular: lista por dia. Tela larga: tabela, com opção de lista.
const telaEstreita = ref(false)
const emLista = ref(false)
const usarLista = computed(() => telaEstreita.value || emLista.value)
let consulta = null
const atualizarLargura = () => (telaEstreita.value = !!consulta?.matches)
onMounted(() => {
  consulta = window.matchMedia('(max-width: 767.98px)')
  atualizarLargura()
  consulta.addEventListener('change', atualizarLargura)
})
onBeforeUnmount(() => consulta?.removeEventListener('change', atualizarLargura))

onMounted(async () => {
  carregando.value = true
  try {
    periodos.value = await http.get('/publico/periodos')
    // Link direto: o período já veio no endereço, e o watch não dispara sozinho.
    if (periodos.value.some((p) => p.id === periodoId.value)) carregarDados(periodoId.value)
    else periodoId.value = periodos.value[0]?.id ?? null
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregando.value = false
  }
})

watch(periodoId, (id) => carregarDados(id))

async function carregarDados(id) {
  dados.value = null
  if (!id) return
  carregando.value = true
  erro.value = ''
  try {
    dados.value = await http.get(`/publico/periodos/${id}`)
    if (!dados.value.recursos[tipo.value].some((r) => r.id === recursoId.value))
      recursoId.value = dados.value.recursos[tipo.value][0]?.id ?? null
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregando.value = false
  }
}

function trocarTipo(novo) {
  tipo.value = novo
  recursoId.value = dados.value?.recursos[novo][0]?.id ?? null
}

watch([periodoId, tipo, recursoId], ([p, t, r]) => {
  copiado.value = false
  if (!p) return
  router.replace({
    name: 'consulta',
    params: { periodoId: p, tipo: r ? t : undefined, recursoId: r ?? undefined },
  })
})

async function baixarPdf() {
  baixando.value = true
  erro.value = ''
  try {
    await baixarArquivo(
      urlDaApi(
        `/publico/periodos/${periodoId.value}/pdf?tipo=${tipo.value}&recurso=${recursoId.value}`
      )
    )
  } catch (e) {
    erro.value = e.message
  } finally {
    baixando.value = false
  }
}

async function copiarLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copiado.value = true
  } catch {
    erro.value = `Não foi possível copiar. Endereço: ${window.location.href}`
  }
}
</script>

<style scoped>
.topo-publico {
  position: sticky;
  top: 0;
  z-index: 1020;
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 64px;
  padding: 0.6rem 1.5rem;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: saturate(180%) blur(10px);
  border-bottom: 1px solid var(--gf-borda);
}
.marca img {
  display: block;
  height: 40px;
  width: auto;
}
.campus {
  padding-left: 1rem;
  border-left: 1px solid var(--gf-borda);
  color: var(--gf-texto-suave);
  font-size: 0.875rem;
  font-weight: 500;
}
.conteudo {
  max-width: 1400px;
  margin: 0 auto;
  padding-inline: 1.5rem;
}
.vazio {
  text-align: center;
  padding: 3.5rem 1.5rem;
  background: var(--gf-superficie);
  border: 1px dashed var(--gf-verde-borda);
  border-radius: var(--gf-raio);
}
.vazio > i {
  display: block;
  font-size: 2.5rem;
  color: var(--gf-verde-vivo);
  margin-bottom: 0.75rem;
}
</style>
