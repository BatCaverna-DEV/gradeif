<template>
  <div>
    <header class="mb-3">
      <h1 class="h3 mb-0">Geração</h1>
      <p class="text-body-secondary mb-0">
        O solver monta a grade do horário escolhido, com as atribuições dele e as restrições do
        período. As aulas fixadas do horário ficam onde estão; as demais são refeitas. Os outros
        horários não mudam.
      </p>
    </header>

    <BAlert v-if="!periodo" :model-value="true" variant="warning"
      >Selecione um período letivo.</BAlert
    >

    <BRow v-else class="g-3">
      <BCol cols="12" lg="5">
        <BCard header-tag="h2" header-class="h6 mb-0" header="Gerar um horário">
          <BAlert v-if="erros.length" :model-value="true" variant="warning" class="small">
            <strong>Pendências que impedem uma grade válida:</strong>
            <ul class="mb-1 ps-3">
              <li v-for="p in erros" :key="p.mensagem">{{ p.mensagem }}</li>
            </ul>
            A geração roda mesmo assim e mostra onde as regras não puderam ser cumpridas.
          </BAlert>

          <BForm @submit.prevent="iniciar">
            <BFormGroup label="Horário" label-for="horario">
              <BFormSelect
                id="horario"
                v-model="form.versaoId"
                :options="opcoesHorario"
                :disabled="emAndamento"
              />
              <template #description>
                <span v-if="horarioEscolhido">
                  {{ horarioEscolhido.totalAtribuicoes }} atribuições,
                  {{ horarioEscolhido.aulasPrevistas ?? 0 }} aulas por semana.
                  <RouterLink
                    :to="{ name: 'horario-atribuicoes', params: { id: horarioEscolhido.id } }"
                    >Ver ou ajustar as atribuições</RouterLink
                  >
                </span>
                <span v-else>Escolha um horário ou crie um novo.</span>
              </template>
            </BFormGroup>
            <div v-if="!emAndamento" class="d-flex gap-2 align-items-start mt-2">
              <BFormInput
                v-model="nomeNovo"
                size="sm"
                maxlength="80"
                placeholder="Nome de um novo horário"
                aria-label="Nome de um novo horário"
              />
              <BButton
                size="sm"
                variant="outline-primary"
                :disabled="!nomeNovo.trim() || criando"
                @click="criarHorario"
                >Criar</BButton
              >
            </div>
            <BAlert
              :model-value="!!horarioEscolhido?.totalAulas"
              variant="warning"
              class="small mt-3 mb-0"
            >
              Este horário já tem {{ horarioEscolhido?.totalAulas }} aula(s) na grade. Gerar de novo
              substitui as aulas que não estão fixadas<template
                v-if="horarioEscolhido?.aulasFixadas"
              >
                (as {{ horarioEscolhido.aulasFixadas }} fixadas ficam)</template
              >. Para guardar a grade atual, duplique o horário antes.
            </BAlert>

            <BFormGroup label="Tempo limite" label-for="tempo" class="mt-3">
              <BFormSelect
                id="tempo"
                v-model="form.tempo"
                :options="TEMPOS"
                :disabled="emAndamento"
              />
              <template #description>
                Mais tempo costuma reduzir a pontuação. O solver para antes se não houver mais o que
                melhorar.
              </template>
            </BFormGroup>

            <BFormGroup
              label="Semente"
              label-for="semente"
              class="mt-3"
              description="Opcional. A mesma semente com os mesmos dados repete a busca; o tempo da máquina ainda pode mudar o resultado."
            >
              <BFormInput
                id="semente"
                v-model="form.semente"
                maxlength="40"
                :disabled="emAndamento"
              />
            </BFormGroup>

            <BAlert :model-value="!!erro" variant="danger" class="mt-3 small">{{ erro }}</BAlert>

            <BButton
              type="submit"
              variant="primary"
              class="mt-3"
              :disabled="emAndamento || iniciando || !form.versaoId"
            >
              <BSpinner v-if="iniciando" small class="me-1" />
              Gerar o horário
            </BButton>
          </BForm>
        </BCard>
      </BCol>

      <BCol cols="12" lg="7">
        <BCard header-tag="h2" header-class="h6 mb-0" header="Andamento" aria-live="polite">
          <p v-if="!job" class="text-body-secondary mb-0">
            Nenhuma geração neste período desde que a API foi iniciada.
          </p>

          <template v-else>
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <div>
                <strong>{{ job.nome }}</strong>
                <BBadge :variant="ESTADOS[job.estado].variante" class="ms-2">
                  {{ ESTADOS[job.estado].rotulo }}
                </BBadge>
              </div>
              <span class="small text-body-secondary">
                {{ formatarDuracao(job.decorridoMs) }} de
                {{ formatarDuracao(job.opcoes.tempoLimiteSegundos * 1000) }}
              </span>
            </div>

            <BProgress
              :value="percentual"
              :max="100"
              :animated="job.ativo"
              :striped="job.ativo"
              :variant="job.estado === 'erro' ? 'danger' : 'primary'"
              height="1.25rem"
              class="mb-3"
              :aria-label="`Progresso: ${Math.round(percentual)}%`"
            />

            <dl class="row small mb-0">
              <template v-if="job.construcao">
                <dt class="col-sm-5">Construção</dt>
                <dd class="col-sm-7">
                  {{ job.construcao.blocos }} blocos em
                  {{ formatarDuracao(job.construcao.tempoMs) }};
                  {{ job.construcao.semLugarAposReparo }} sem lugar depois do reparo
                </dd>
              </template>
              <template v-if="job.progresso">
                <dt class="col-sm-5">Movimentos testados</dt>
                <dd class="col-sm-7">{{ formatarNumero(job.progresso.iteracao) }}</dd>
                <dt class="col-sm-5">Melhor grade até agora</dt>
                <dd class="col-sm-7">
                  <span :class="job.progresso.melhorRigido ? 'text-danger' : 'text-success'">
                    {{
                      job.progresso.melhorRigido
                        ? `${job.progresso.melhorRigido} violação(ões) rígida(s)`
                        : 'sem violação rígida'
                    }}</span
                  >, pontuação {{ formatarNumero(job.progresso.melhorFlexivel) }}
                </dd>
              </template>
              <template v-if="job.avisos?.length">
                <dt class="col-sm-5">Avisos</dt>
                <dd class="col-sm-7">
                  <div v-for="a in job.avisos" :key="a">{{ a }}</div>
                </dd>
              </template>
            </dl>

            <div v-if="job.ativo" class="d-flex flex-wrap gap-2 mt-3">
              <BButton
                variant="outline-primary"
                size="sm"
                :disabled="!!job.cancelamento || job.estado === 'gravando' || !podeCancelar"
                @click="cancelar(true)"
              >
                Encerrar agora e salvar
              </BButton>
              <BButton
                variant="outline-danger"
                size="sm"
                :disabled="!!job.cancelamento || job.estado === 'gravando' || !podeCancelar"
                @click="cancelar(false)"
              >
                Cancelar sem salvar
              </BButton>
              <span v-if="job.cancelamento" class="small text-body-secondary align-self-center">
                Encerrando…
              </span>
            </div>

            <BAlert
              v-if="job.estado === 'concluido'"
              :model-value="true"
              :variant="job.resultado.valida ? 'success' : 'warning'"
              class="mt-3 mb-0"
            >
              <div class="fw-semibold">
                {{
                  job.resultado.valida
                    ? 'Grade gerada sem violar nenhuma regra rígida.'
                    : `Grade gerada com ${job.resultado.custoRigido} violação(ões) rígida(s).`
                }}
              </div>
              <div class="small">
                Pontuação {{ formatarNumero(job.resultado.pontuacao) }} ·
                {{ formatarNumero(job.resultado.iteracoes) }} movimentos em
                {{ formatarDuracao(job.resultado.tempoMs) }}
                <span v-if="job.resultado.naoAlocados">
                  · {{ job.resultado.naoAlocados }} atribuição(ões) com aulas sem lugar</span
                >
              </div>
              <RouterLink
                :to="{ name: 'versao', params: { id: job.resultado.versao.id } }"
                class="btn btn-sm btn-primary mt-2"
              >
                Ver o horário e as violações
              </RouterLink>
            </BAlert>

            <BAlert
              v-if="job.estado === 'erro'"
              :model-value="true"
              variant="danger"
              class="mt-3 mb-0"
            >
              {{ job.erro.mensagem }}
              <ul v-if="job.erro.detalhes?.length" class="mb-0 small">
                <li v-for="d in job.erro.detalhes" :key="String(d)">
                  {{ typeof d === 'string' ? d : d.mensagem }}
                </li>
              </ul>
            </BAlert>

            <p v-if="job.estado === 'cancelado'" class="small text-body-secondary mt-3 mb-0">
              Geração cancelada. O horário ficou como estava.
            </p>
          </template>

          <p v-if="conexao === 'reconectando'" class="small text-warning-emphasis mt-2 mb-0">
            Conexão com o servidor interrompida; tentando de novo…
          </p>
        </BCard>
      </BCol>
    </BRow>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  BAlert,
  BBadge,
  BButton,
  BCard,
  BCol,
  BForm,
  BFormGroup,
  BFormInput,
  BFormSelect,
  BProgress,
  BRow,
  BSpinner,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro, urlDaApi } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { usePeriodoStore } from '@/stores/periodo'
import { formatarDuracao, formatarNumero } from '@/utils/formato'

const TEMPOS = [
  { value: 30, text: '30 segundos' },
  { value: 60, text: '1 minuto' },
  { value: 120, text: '2 minutos' },
  { value: 300, text: '5 minutos' },
  { value: 600, text: '10 minutos' },
  { value: 1200, text: '20 minutos' },
]

const ESTADOS = {
  preparando: { rotulo: 'Preparando os dados', variante: 'secondary' },
  executando: { rotulo: 'Em execução', variante: 'primary' },
  gravando: { rotulo: 'Gravando a versão', variante: 'primary' },
  concluido: { rotulo: 'Concluída', variante: 'success' },
  cancelado: { rotulo: 'Cancelada', variante: 'secondary' },
  erro: { rotulo: 'Falhou', variante: 'danger' },
}

const periodoStore = usePeriodoStore()
const auth = useAuthStore()
const periodo = computed(() => periodoStore.ativo)

const rota = useRoute()
// "Gerar" na lista de horários e "Regenerar o resto" no editor chegam com ?horario=<id>.
const horarioDaRota = Number(rota.query.horario) || null
const form = reactive({ versaoId: null, tempo: 60, semente: '' })
const nomeNovo = ref('')
const criando = ref(false)
const job = ref(null)
const erro = ref('')
const iniciando = ref(false)
const pendencias = ref([])
const versoes = ref([])
const conexao = ref('fechada')
let fonte = null

const emAndamento = computed(() => !!job.value?.ativo)
const erros = computed(() => pendencias.value.filter((p) => p.nivel === 'erro'))
// O horário publicado não pode ser regerado, e só o editor gera o horário.
const podeGerar = (v) => !v.publicada && auth.ehEditorDe(v)
function rotuloHorario(v) {
  if (v.publicada) return `${v.nome} (publicado)`
  if (!auth.ehEditorDe(v))
    return `${v.nome} (${v.editor ? `editado por ${v.editor.nome}` : 'sem editor'})`
  return `${v.nome}${v.totalAulas ? '' : ' (sem aulas)'}`
}
const opcoesHorario = computed(() => [
  { value: null, text: 'Escolha o horário…', disabled: true },
  ...versoes.value.map((v) => ({ value: v.id, text: rotuloHorario(v), disabled: !podeGerar(v) })),
])
// Encerrar a geração em andamento: só o editor do horário que está sendo gerado.
const podeCancelar = computed(() => {
  const gerado = versoes.value.find((v) => v.id === job.value?.opcoes?.versaoId)
  return !gerado || auth.ehEditorDe(gerado)
})
const horarioEscolhido = computed(() => versoes.value.find((v) => v.id === form.versaoId) ?? null)

const percentual = computed(() => {
  const j = job.value
  if (!j) return 0
  if (j.estado === 'concluido' || j.estado === 'gravando') return 100
  if (j.progresso?.fracao != null) return Math.min(100, j.progresso.fracao * 100)
  return Math.min(99, (j.decorridoMs / (j.opcoes.tempoLimiteSegundos * 1000)) * 100)
})

function abrirEventos(periodoId) {
  fecharEventos()
  fonte = new EventSource(urlDaApi(`/periodos/${periodoId}/geracao/eventos`), {
    withCredentials: true,
  })
  fonte.addEventListener('job', (evento) => {
    conexao.value = 'aberta'
    const anterior = job.value
    job.value = JSON.parse(evento.data).job
    // Ao terminar, a lista de versões muda.
    if (anterior?.ativo && job.value && !job.value.ativo) carregarApoio(periodoId)
  })
  fonte.onerror = async () => {
    conexao.value = 'reconectando'
    // Sessão expirada: o EventSource não informa o status; confere pela API (um 401
    // limpa o usuário e o layout leva ao login).
    await http.get('/auth/eu').catch(() => {})
    if (!auth.autenticado) fecharEventos()
  }
}

function fecharEventos() {
  fonte?.close()
  fonte = null
  conexao.value = 'fechada'
}

async function carregarApoio(periodoId) {
  try {
    const [painel, lista] = await Promise.all([
      http.get(`/periodos/${periodoId}/painel`),
      http.get(`/periodos/${periodoId}/versoes`),
    ])
    pendencias.value = painel.pendencias
    versoes.value = lista
    if (!form.versaoId) {
      const pedido = lista.find((v) => v.id === horarioDaRota && podeGerar(v))
      form.versaoId = pedido?.id ?? lista.find(podeGerar)?.id ?? null
    }
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}

watch(
  () => periodo.value?.id,
  (id) => {
    job.value = null
    erro.value = ''
    pendencias.value = []
    versoes.value = []
    form.versaoId = null
    if (!id) return fecharEventos()
    abrirEventos(id)
    carregarApoio(id)
  },
  { immediate: true }
)

onBeforeUnmount(fecharEventos)

async function iniciar() {
  iniciando.value = true
  erro.value = ''
  try {
    const corpo = { versaoId: form.versaoId, tempoLimiteSegundos: form.tempo }
    if (form.semente.trim()) corpo.semente = form.semente.trim()
    job.value = (await http.post(`/periodos/${periodo.value.id}/geracao`, corpo)).job
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    iniciando.value = false
  }
}

// Cria um horário com as atribuições da oferta e já o escolhe para gerar.
async function criarHorario() {
  criando.value = true
  erro.value = ''
  try {
    const criado = await http.post(`/periodos/${periodo.value.id}/versoes`, {
      nome: nomeNovo.value.trim(),
    })
    versoes.value = [criado, ...versoes.value]
    form.versaoId = criado.id
    nomeNovo.value = ''
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    criando.value = false
  }
}

async function cancelar(salvar) {
  erro.value = ''
  try {
    job.value = (await http.post(`/periodos/${periodo.value.id}/geracao/cancelar`, { salvar })).job
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}
</script>
