<template>
  <div>
    <!-- Cabeçalho compacto: uma linha, para a grade ficar com a maior parte da tela. -->
    <header class="cabecalho-grade d-flex flex-wrap align-items-center gap-2 mb-2">
      <RouterLink
        :to="{ name: 'versoes' }"
        class="btn btn-sm btn-light"
        title="Voltar para os horários"
        aria-label="Voltar para os horários"
        ><i class="bi bi-arrow-left" aria-hidden="true"
      /></RouterLink>
      <h1 class="h5 mb-0 text-truncate">Editor · {{ versao?.nome ?? '' }}</h1>
      <template v-if="avaliacao">
        <BBadge :variant="avaliacao.valida ? 'success' : 'danger'" aria-live="polite">
          {{ avaliacao.valida ? 'Válida' : `${avaliacao.custoRigido} rígida(s)` }}
        </BBadge>
        <span class="small">Pontuação {{ formatarNumero(avaliacao.pontuacao) }}</span>
        <span v-if="ultimaVariacao" class="small" :class="ultimaVariacao.classe">{{
          ultimaVariacao.texto
        }}</span>
      </template>
      <EditorDoHorario
        v-if="versao && !versao.publicada"
        selo
        :versao="versao"
        @atualizado="(v) => (versao = v)"
      />
      <div class="d-flex flex-wrap gap-1 ms-auto">
        <BButton
          size="sm"
          variant="outline-secondary"
          :disabled="!desfazer.length || ocupado"
          :title="
            desfazer.length ? `Desfazer: ${desfazer.at(-1).descricao} (Ctrl+Z)` : 'Nada a desfazer'
          "
          @click="voltar"
          >↶ Desfazer</BButton
        >
        <BButton
          size="sm"
          variant="outline-secondary"
          :disabled="!refazer.length || ocupado"
          :title="
            refazer.length ? `Refazer: ${refazer.at(-1).descricao} (Ctrl+Y)` : 'Nada a refazer'
          "
          @click="avancar"
          >↷ Refazer</BButton
        >
        <RouterLink
          :to="{ name: 'horario-atribuicoes', params: { id } }"
          class="btn btn-sm btn-outline-secondary"
          >Atribuições</RouterLink
        >
        <BDropdown size="sm" variant="outline-secondary" text="Mais" end>
          <BDropdownItem :to="{ name: 'versao', params: { id } }">Resumo</BDropdownItem>
          <BDropdownItem :to="{ name: 'comparar', query: { a: id } }">Comparar</BDropdownItem>
          <BDropdownItem
            v-if="editavel"
            :to="{ name: 'geracao', query: { horario: id } }"
            title="Gera este horário de novo, mantendo as aulas fixadas"
            >Regenerar o resto</BDropdownItem
          >
        </BDropdown>
        <ControlesDaGrade />
      </div>
    </header>

    <BAlert :model-value="!!erro" variant="danger" dismissible @update:model-value="erro = ''">
      {{ erro }}
    </BAlert>
    <BAlert :model-value="!!versao?.publicada" variant="info" class="py-2">
      Este horário está publicado e não pode ser alterado. Duplique-o na tela de horários para
      ajustar.
    </BAlert>

    <div v-if="carregando" class="text-center py-5"><BSpinner label="Carregando" /></div>

    <BRow v-else-if="versao && gradeHoraria" class="g-3">
      <BCol cols="12" :xl="painelRecolhido ? 12 : 8" :xxl="painelRecolhido ? 12 : 9">
        <BCard no-body>
          <div class="d-flex flex-wrap gap-2 align-items-center px-2 py-1 border-bottom">
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
            <!-- Legenda na mesma linha (antes era uma linha própria). -->
            <span class="legenda small text-nowrap" aria-hidden="true">
              <span class="amostra nivel-livre"></span> livre
              <span class="amostra nivel-flexivel"></span> flexível
              <span class="amostra nivel-rigida"></span> rígida
              <template v-if="selecao?.tipo === 'faltante'">
                <span class="amostra professor-livre"></span> prof. disponível
                <span class="amostra professor-evitar"></span> prefere evitar
              </template>
            </span>
            <span class="ms-auto" />
            <!-- Abaixo de 1400px some: o cartão da aula escolhida já orienta. -->
            <span class="small text-body-secondary d-none d-xxl-inline">{{ instrucao }}</span>
            <!-- Com o painel recolhido, os contadores ficam aqui e abrem o painel. -->
            <span v-if="painelRecolhido" class="d-flex gap-1">
              <BButton
                v-for="c in contadoresDoPainel"
                :key="c.aba"
                size="sm"
                :variant="c.total ? c.variante : 'outline-secondary'"
                :title="`Abrir o painel em ${c.rotulo}`"
                @click="abrirPainel(c.aba)"
                >{{ c.rotulo }} <span class="badge text-bg-light">{{ c.total }}</span></BButton
              >
            </span>
          </div>
          <div ref="areaGrade" :class="{ 'opacity-50': ocupado }">
            <GradeDias
              v-if="visao === 'dias'"
              :grade-horaria="gradeHoraria"
              :turno-id="recursoId"
              :turmas="turmasDoHorario"
              :aulas="aulasVisiveis"
              :aulas-da-semana="aulas"
              :indisponiveis="indisponiveis"
              :destaque="destaque"
              :editavel="editavel"
              :celulas="simulacao"
              :turma-alvo="turmaAlvo"
              :selecionada="selecao?.tipo === 'aula' ? selecao.aula.id : null"
              :mostrar-professor="selecao?.tipo === 'faltante'"
              :compacta="gradeCompacta"
              :altura-maxima="alturaGrade"
              :titulo="`Turno ${rotuloRecurso}, todos os dias`"
              @selecionar="selecionarAula"
              @arrastar="selecionarAula($event, true)"
              @clicar-celula="escolherDestino($event, null)"
              @soltar="escolherDestino($event.horarioId, $event.aulaAlvo)"
            />
            <GradeSemanal
              v-else
              :grade-horaria="gradeHoraria"
              :aulas="aulasVisiveis"
              :visao="visao"
              :destaque="destaque"
              :turnos-abertos="turnosAbertosDaVisao"
              :fechados="fechadosDaVisao"
              :editavel="editavel"
              :celulas="simulacao"
              :selecionada="selecao?.tipo === 'aula' ? selecao.aula.id : null"
              :mostrar-professor="selecao?.tipo === 'faltante'"
              :compacta="gradeCompacta"
              :altura-maxima="alturaGrade"
              :titulo="`Grade de ${rotuloRecurso}`"
              @selecionar="selecionarAula"
              @arrastar="selecionarAula($event, true)"
              @clicar-celula="escolherDestino($event, null)"
              @soltar="escolherDestino($event.horarioId, $event.aulaAlvo)"
            />
          </div>
        </BCard>
      </BCol>

      <BCol v-show="!painelRecolhido" cols="12" xl="4" xxl="3">
        <!-- Com o painel recolhido, a aula escolhida aparece num cartão flutuante. -->
        <Teleport to="body" :disabled="!painelRecolhido">
          <BCard
            v-if="selecao"
            class="mb-3"
            :class="{ 'selecao-flutuante': painelRecolhido }"
            body-class="small"
          >
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <strong>{{ sel.sigla }} — {{ sel.disciplina }}</strong>
                <div>
                  Turma {{ sel.turma }} · {{ sel.professores.map((p) => p.nome).join(', ') }}
                </div>
                <div v-if="selecao.tipo === 'aula'">
                  {{ rotuloHorario(sel.horarioId) }} · {{ sel.sala ?? 'sem sala' }}
                </div>
                <div v-else>{{ selecao.faltante.faltam }} aula(s) sem lugar</div>
              </div>
              <BCloseButton aria-label="Cancelar seleção" @click="limparSelecao" />
            </div>
            <p class="text-body-secondary mt-2 mb-2">
              <BSpinner v-if="simulando" small class="me-1" />
              {{
                simulando
                  ? 'Calculando as posições…'
                  : 'Clique numa célula colorida ou arraste o cartão. Sobre outra aula, propõe a troca.'
              }}
            </p>
            <template v-if="selecao.tipo === 'aula' && editavel">
              <div class="d-flex flex-wrap gap-2 align-items-center">
                <BButton
                  size="sm"
                  variant="outline-secondary"
                  :disabled="ocupado"
                  @click="alternarFixada(sel)"
                >
                  {{ sel.fixada ? '🔓 Liberar' : '🔒 Fixar' }}
                </BButton>
                <BButton
                  v-if="sel.revisar"
                  size="sm"
                  variant="outline-warning"
                  :disabled="ocupado"
                  @click="marcarRevisada(sel)"
                  >Marcar revisada</BButton
                >
                <BButton
                  size="sm"
                  variant="outline-danger"
                  :disabled="ocupado"
                  @click="remover(sel)"
                  >Tirar da grade</BButton
                >
              </div>
              <label for="sala-aula" class="form-label mt-2 mb-1">Sala</label>
              <BFormSelect
                id="sala-aula"
                size="sm"
                :model-value="sel.salaId"
                :options="opcoesSala"
                :disabled="ocupado"
                @update:model-value="trocarSala(sel, $event)"
              />
              <div class="mt-2 fw-semibold">
                {{
                  violacoesDaAula.length ? 'Violações desta aula' : 'Nenhuma violação nesta aula.'
                }}
              </div>
              <ul class="mb-0 ps-3">
                <li v-for="(v, k) in violacoesDaAula" :key="k">{{ v.codigo }}: {{ v.mensagem }}</li>
              </ul>
            </template>
          </BCard>
        </Teleport>

        <BCard no-body class="painel-lateral">
          <BTabs v-model="aba" card nav-wrapper-class="px-2 pt-2" small>
            <BTab id="faltantes" :title="`Não alocadas (${totalFaltantes})`">
              <p v-if="!faltantesVisiveis.length" class="small text-body-secondary mb-0">
                {{
                  visao === 'turma'
                    ? 'Todas as aulas desta turma estão na grade.'
                    : 'Todas as aulas estão na grade.'
                }}
              </p>
              <ul v-else class="list-unstyled mb-0 lista">
                <li v-for="f in faltantesVisiveis" :key="f.atribuicaoId">
                  <button
                    type="button"
                    class="item-lista"
                    :class="{
                      ativo:
                        selecao?.tipo === 'faltante' &&
                        selecao.faltante.atribuicaoId === f.atribuicaoId,
                    }"
                    :style="faixaProfessor(f)"
                    :draggable="editavel"
                    :disabled="!editavel"
                    @click="selecionarFaltante(f)"
                    @dragstart="aoArrastarFaltante($event, f)"
                    @dragend="arrastandoFaltante = false"
                  >
                    <strong>{{ f.turma }} · {{ f.sigla }}</strong>
                    <span class="badge text-bg-danger ms-1">faltam {{ f.faltam }}</span>
                    <span class="d-block small text-body-secondary">
                      {{ f.professores.map((p) => p.nome).join(', ') }}
                      <template v-if="f.tamanhoBloco > 1">
                        · geminadas de {{ f.tamanhoBloco }}</template
                      >
                    </span>
                  </button>
                </li>
              </ul>
            </BTab>
            <BTab id="revisar" :title="`Para revisar (${aRevisar.length})`">
              <p class="small text-body-secondary">
                Aulas afetadas por uma reimportação. Mova a aula ou marque como revisada.
              </p>
              <p v-if="!aRevisar.length" class="small text-body-secondary mb-0">
                Nada para revisar.
              </p>
              <ul v-else class="list-unstyled mb-0 lista">
                <li v-for="a in aRevisar" :key="a.id" class="d-flex gap-1 align-items-start">
                  <button type="button" class="item-lista" @click="irParaAula(a)">
                    <strong>{{ a.turma }} · {{ a.sigla }}</strong>
                    <span class="d-block small text-body-secondary">{{
                      rotuloHorario(a.horarioId)
                    }}</span>
                  </button>
                  <BButton
                    v-if="editavel"
                    size="sm"
                    variant="outline-secondary"
                    :disabled="ocupado"
                    @click="marcarRevisada(a)"
                    >Revisada</BButton
                  >
                </li>
              </ul>
            </BTab>
            <BTab id="violacoes" :title="`Violações (${avaliacao?.violacoes.length ?? 0})`">
              <PainelViolacoes
                :violacoes="avaliacao?.violacoes ?? []"
                :pertence-a-visao="pertenceAVisao"
                :pesos="pesos"
                :selecionada="violacaoSelecionada"
                @selecionar="selecionarViolacao"
              />
            </BTab>
          </BTabs>
        </BCard>
      </BCol>
    </BRow>

    <BModal
      v-model="confirmacao.visivel"
      :title="confirmacao.titulo"
      :ok-title="confirmacao.ok"
      :ok-variant="confirmacao.variante"
      cancel-title="Cancelar"
      @ok="confirmacao.acao()"
    >
      <p v-if="confirmacao.texto">{{ confirmacao.texto }}</p>
      <ul v-if="confirmacao.motivos.length" class="small mb-0">
        <li v-for="m in confirmacao.motivos" :key="m">{{ m }}</li>
      </ul>
    </BModal>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BAlert,
  BBadge,
  BButton,
  BButtonGroup,
  BCard,
  BCloseButton,
  BCol,
  BDropdown,
  BDropdownItem,
  BFormSelect,
  BModal,
  BRow,
  BSpinner,
  BTab,
  BTabs,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { usePeriodoStore } from '@/stores/periodo'
import ControlesDaGrade from '@/components/ControlesDaGrade.vue'
import EditorDoHorario from '@/components/EditorDoHorario.vue'
import GradeDias from '@/components/GradeDias.vue'
import GradeSemanal from '@/components/GradeSemanal.vue'
import PainelViolacoes from '@/components/PainelViolacoes.vue'
import { DIAS, formatarNumero } from '@/utils/formato'
import { mapaDeIndisponiveis, temposFechados, turnosAbertos } from '@/utils/disponibilidadeTurma'
import { gradeCompacta, menuRecolhido, painelRecolhido } from '@/utils/preferencias'
import { useAlturaDaGrade } from '@/utils/alturaDaGrade'

const props = defineProps({ id: { type: Number, required: true } })

const VISOES = [
  { valor: 'turma', rotulo: 'Turma' },
  { valor: 'professor', rotulo: 'Professor' },
  { valor: 'sala', rotulo: 'Sala' },
  // Um turno com todos os dias de uma vez e as turmas lado a lado.
  { valor: 'dias', rotulo: 'Dias' },
]

const periodoStore = usePeriodoStore()
const rota = useRoute()
const router = useRouter()

const carregando = ref(false)
const ocupado = ref(false)
const erro = ref('')
const versao = ref(null)
const gradeHoraria = ref(null)
const aulas = ref([])
const avaliacao = ref(null)
const faltantes = ref([])
const turmas = ref([])
const atribuicoes = ref([])
const salas = ref([])
const restricoes = ref([])
const indisponiveis = ref(new Map()) // turmaId → Set(horarioId) indisponível neste horário
const aba = ref('faltantes')

const auth = useAuthStore()
// Só o editor do horário altera; os outros gestores veem a grade sem poder mexer.
const editavel = computed(
  () => !!versao.value && !versao.value.publicada && auth.ehEditorDe(versao.value)
)
const base = computed(() => `/periodos/${periodoStore.ativoId}/versoes/${props.id}`)

async function carregar() {
  if (!periodoStore.ativoId) return
  carregando.value = true
  erro.value = ''
  limparSelecao()
  desfazer.value = []
  refazer.value = []
  const periodo = `/periodos/${periodoStore.ativoId}`
  try {
    const [v, estado, grade, t, at, s, r, disp] = await Promise.all([
      http.get(base.value),
      http.get(`${base.value}/edicao`),
      http.get(`${periodo}/grade-horaria`),
      http.get(`${periodo}/dados/turmas`),
      http.get(`${base.value}/atribuicoes`),
      http.get(`${periodo}/dados/salas`),
      http.get(`${periodo}/restricoes`),
      http.get(`${periodo}/disponibilidade/turmas?versao=${props.id}`),
    ])
    indisponiveis.value = mapaDeIndisponiveis(disp)
    versao.value = v
    aulas.value = estado.aulas
    avaliacao.value = estado.avaliacao
    faltantes.value = estado.faltantes
    gradeHoraria.value = grade
    turmas.value = t
    // Atribuições deste horário (não as da oferta): os ids batem com os das aulas.
    atribuicoes.value = at.atribuicoes
    salas.value = s
    restricoes.value = r
    if (!opcoesRecurso.value.some((o) => o.value === recursoId.value))
      recursoId.value = opcoesRecurso.value[0]?.value ?? null
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregando.value = false
  }
}

// ---------- Visão (turma, professor, sala, dia) ----------
const visao = ref(VISOES.some((v) => v.valor === rota.query.visao) ? rota.query.visao : 'turma')
const recursoId = ref(Number(rota.query.recurso) || null)

const professores = computed(() => {
  const mapa = new Map()
  for (const a of atribuicoes.value) for (const p of a.professoresDetalhe) mapa.set(p.id, p.nome)
  return [...mapa].map(([id, nome]) => ({ id, nome })).sort((x, y) => x.nome.localeCompare(y.nome))
})

// Só as turmas que têm atribuição neste horário.
const turmasDoHorario = computed(() => {
  const ids = new Set(atribuicoes.value.map((a) => a.turmaId))
  return turmas.value.filter((t) => ids.has(t.id))
})

const opcoesRecurso = computed(() => {
  if (visao.value === 'turma')
    return turmasDoHorario.value.map((t) => ({ value: t.id, text: t.codigo }))
  if (visao.value === 'professor')
    return professores.value.map((p) => ({ value: p.id, text: p.nome }))
  if (visao.value === 'dias')
    return (gradeHoraria.value?.turnos ?? [])
      .filter((t) => turmasDoHorario.value.some((x) => turnosDaTurma(x).has(t.id)))
      .map((t) => ({ value: t.id, text: t.nome }))
  return salas.value.filter((s) => s.ativa).map((s) => ({ value: s.id, text: s.nome }))
})
const rotuloRecurso = computed(
  () => opcoesRecurso.value.find((o) => o.value === recursoId.value)?.text ?? ''
)
const opcoesSala = computed(() => [
  { value: null, text: 'Sem sala' },
  ...salas.value
    .filter((s) => s.ativa)
    .map((s) => ({ value: s.id, text: `${s.nome} (${s.tipo}, ${s.capacidade})` })),
])

function trocarVisao(nova, id = null) {
  visao.value = nova
  recursoId.value = id ?? opcoesRecurso.value[0]?.value ?? null
}

watch([visao, recursoId], () => {
  router.replace({
    query: { ...rota.query, visao: visao.value, recurso: recursoId.value ?? undefined },
  })
})

const horarioPorId = computed(
  () => new Map((gradeHoraria.value?.horarios ?? []).map((h) => [h.id, h]))
)

// ---------- Disponibilidade das turmas neste horário ----------
// Um tempo está aberto para a turma quando o turno é permitido e ele não foi marcado
// como indisponível. A turma aparece nos turnos em que tem aula e nos que têm algum
// tempo aberto; os tempos fechados ficam riscados e não recebem aula nova.
const turnosEmUso = computed(() => {
  const mapa = new Map()
  for (const a of aulas.value) {
    const h = horarioPorId.value.get(a.horarioId)
    if (!h) continue
    if (!mapa.has(a.turmaId)) mapa.set(a.turmaId, new Set())
    mapa.get(a.turmaId).add(h.turnoId)
  }
  return mapa
})
const horariosDaGrade = computed(() => gradeHoraria.value?.horarios ?? [])
const abertosDa = (turma) => turnosAbertos(turma, horariosDaGrade.value, indisponiveis.value)
const fechadosDa = (turma) => temposFechados(turma, horariosDaGrade.value, indisponiveis.value)
function turnosDaTurma(turma) {
  return new Set([...(turnosEmUso.value.get(turma?.id) ?? []), ...abertosDa(turma)])
}
const turmaDaVisao = computed(() =>
  visao.value === 'turma' ? turmas.value.find((t) => t.id === recursoId.value) : null
)
const turnosAbertosDaVisao = computed(() =>
  turmaDaVisao.value ? [...abertosDa(turmaDaVisao.value)] : []
)
const fechadosDaVisao = computed(() =>
  turmaDaVisao.value ? fechadosDa(turmaDaVisao.value) : new Set()
)

function daVisao(a) {
  if (visao.value === 'turma') return a.turmaId === recursoId.value
  if (visao.value === 'professor') return a.professores.some((p) => p.id === recursoId.value)
  if (visao.value === 'dias')
    return horarioPorId.value.get(a.horarioId)?.turnoId === recursoId.value
  return a.salaId === recursoId.value
}
const aulasVisiveis = computed(() => aulas.value.filter(daVisao))

function rotuloHorario(horarioId) {
  const h = gradeHoraria.value?.horarios.find((x) => x.id === horarioId)
  if (!h) return ''
  const turno = gradeHoraria.value.turnos.find((t) => t.id === h.turnoId)?.nome ?? ''
  return `${DIAS[h.diaSemana]}, ${h.ordem}º tempo (${turno})`
}

// ---------- Seleção e simulação (F4-01, F4-03) ----------
const selecao = ref(null) // { tipo: 'aula', aula } | { tipo: 'faltante', faltante }
const simulacao = ref(null) // Map horarioId → célula
const simulando = ref(false)
let simulacaoPendente = null
const destaque = ref(new Set())
const violacaoSelecionada = ref(-1)
const arrastandoFaltante = ref(false)

const sel = computed(() =>
  selecao.value?.tipo === 'aula' ? selecao.value.aula : selecao.value?.faltante
)
// Na visão por dia, a simulação pinta só a coluna da turma da aula escolhida.
const turmaAlvo = computed(() => sel.value?.turmaId ?? null)

const instrucao = computed(() => {
  if (!editavel.value) return 'Somente leitura'
  if (!selecao.value) return 'Clique ou arraste uma aula'
  return 'Escolha o destino · Esc cancela'
})

function limparSelecao() {
  selecao.value = null
  simulacao.value = null
  simulacaoPendente = null
  destaque.value = new Set()
}

async function simular(corpo) {
  simulando.value = true
  simulacao.value = null
  const pedido = http.post(`${base.value}/edicao/simular`, corpo)
  simulacaoPendente = pedido
  try {
    const r = await pedido
    if (simulacaoPendente === pedido)
      simulacao.value = new Map(r.celulas.map((c) => [c.horarioId, c]))
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    if (simulacaoPendente === pedido) simulando.value = false
  }
}

function selecionarAula(aula, arrastando = false) {
  const atual = aulas.value.find((a) => a.id === aula.id) ?? aula
  violacaoSelecionada.value = -1
  const mesma = selecao.value?.tipo === 'aula' && selecao.value.aula.id === atual.id
  if (mesma && arrastando) return // já selecionada e simulada
  if (mesma) return limparSelecao()
  // Com uma aula já escolhida, clicar em outra propõe a troca.
  if (!arrastando && editavel.value && selecao.value?.tipo === 'aula' && simulacao.value) {
    return escolherDestino(atual.horarioId, atual)
  }
  selecao.value = { tipo: 'aula', aula: atual }
  destaque.value = new Set([atual.id])
  if (editavel.value) simular({ aulaId: atual.id })
}

function selecionarFaltante(f) {
  if (!editavel.value) return
  if (selecao.value?.tipo === 'faltante' && selecao.value.faltante.atribuicaoId === f.atribuicaoId)
    return limparSelecao()
  selecao.value = { tipo: 'faltante', faltante: f }
  destaque.value = new Set()
  if (visao.value === 'dias') {
    // As turmas ficam lado a lado: só troca de turno se a turma não aparece neste.
    const turnos = turnosDaTurma(turmas.value.find((t) => t.id === f.turmaId))
    if (turnos.size && !turnos.has(recursoId.value)) trocarVisao('dias', [...turnos][0])
  } else if (visao.value !== 'turma' || recursoId.value !== f.turmaId) {
    trocarVisao('turma', f.turmaId)
  }
  simular({ atribuicaoId: f.atribuicaoId })
}

function aoArrastarFaltante(evento, f) {
  evento.dataTransfer.effectAllowed = 'move'
  evento.dataTransfer.setData('text/plain', `atribuicao:${f.atribuicaoId}`)
  arrastandoFaltante.value = true
  if (selecao.value?.tipo !== 'faltante' || selecao.value.faltante.atribuicaoId !== f.atribuicaoId)
    selecionarFaltante(f)
}

// Destino escolhido por clique ou arraste. Sobre outra aula, propõe a troca.
async function escolherDestino(horarioId, aulaAlvo) {
  if (!editavel.value || !selecao.value || ocupado.value) return
  const s = selecao.value
  if (aulaAlvo && s.tipo === 'aula' && aulaAlvo.id !== s.aula.id) {
    return confirmar({
      titulo: 'Trocar as aulas de lugar?',
      texto: `${s.aula.turma} · ${s.aula.sigla} (${rotuloHorario(s.aula.horarioId)}) ↔ ${aulaAlvo.turma} · ${aulaAlvo.sigla} (${rotuloHorario(aulaAlvo.horarioId)})`,
      motivos: [],
      ok: 'Trocar',
      variante: 'primary',
      acao: () => trocar(s.aula, aulaAlvo),
    })
  }
  if (simulacaoPendente) await simulacaoPendente.catch(() => {})
  const celula = simulacao.value?.get(horarioId)
  if (!celula || celula.nivel === 'atual') return
  const executar = () =>
    s.tipo === 'aula'
      ? mover(s.aula, horarioId, celula.salaId)
      : alocar(s.faltante, horarioId, celula.salaId)
  if (celula.nivel === 'rigida') {
    return confirmar({
      titulo: 'Esta posição viola regras rígidas',
      texto: `${rotuloHorario(horarioId)}. A grade fica inválida até o conflito ser resolvido:`,
      motivos: celula.motivos,
      ok: 'Mover mesmo assim',
      variante: 'danger',
      acao: executar,
    })
  }
  executar()
}

// ---------- Confirmação ----------
const confirmacao = reactive({
  visivel: false,
  titulo: '',
  texto: '',
  motivos: [],
  ok: 'Confirmar',
  variante: 'primary',
  acao: () => {},
})
function confirmar(opcoes) {
  Object.assign(confirmacao, opcoes, { visivel: true })
}

// ---------- Alterações e histórico (F4-02, F4-05 a F4-08) ----------
const desfazer = ref([])
const refazer = ref([])
const ultimaVariacao = ref(null)
// Aulas recriadas no desfazer ganham id novo; o histórico guarda o id original.
const novosIds = new Map()
const idReal = (id) => {
  let atual = id
  while (novosIds.has(atual)) atual = novosIds.get(atual)
  return atual
}

function aplicarResposta(r) {
  const removidas = new Set(r.removidas ?? [])
  const alteradas = new Map((r.alteradas ?? []).map((a) => [a.id, a]))
  const lista = aulas.value.filter((a) => !removidas.has(a.id)).map((a) => alteradas.get(a.id) ?? a)
  for (const [id, a] of alteradas) if (!lista.some((x) => x.id === id)) lista.push(a)
  aulas.value = lista
  const antes = avaliacao.value
  avaliacao.value = r.avaliacao
  faltantes.value = r.faltantes
  if (antes) {
    const dr = r.avaliacao.custoRigido - antes.custoRigido
    const df = r.avaliacao.pontuacao - antes.pontuacao
    const partes = []
    if (dr) partes.push(`${dr > 0 ? '+' : ''}${dr} rígida(s)`)
    if (df) partes.push(`pontuação ${df > 0 ? '+' : ''}${formatarNumero(df)}`)
    ultimaVariacao.value = partes.length
      ? {
          texto: `Última alteração: ${partes.join(', ')}`,
          classe: dr > 0 || (!dr && df > 0) ? 'text-danger' : 'text-success',
        }
      : { texto: 'Última alteração: sem efeito na pontuação', classe: 'text-body-secondary' }
  }
}

async function executar(acao) {
  ocupado.value = true
  erro.value = ''
  try {
    return await acao()
  } catch (e) {
    erro.value = mensagemDeErro(e)
    return null
  } finally {
    ocupado.value = false
  }
}

const posicionar = async (movimentos) => {
  const r = await http.post(`${base.value}/edicao/posicionar`, {
    movimentos: movimentos.map((m) => ({ ...m, aulaId: idReal(m.aulaId) })),
  })
  aplicarResposta(r)
  return r
}

async function registrar(descricao, fazer, desfazerAcao) {
  const r = await executar(fazer)
  if (!r) return
  desfazer.value.push({ descricao, desfazer: desfazerAcao(r), refazer: fazer })
  refazer.value = []
  limparSelecao()
}

function mover(aula, horarioId, salaId) {
  const original = aula.id
  registrar(
    `mover ${aula.turma} · ${aula.sigla}`,
    () => posicionar([{ aulaId: original, horarioId, salaId }]),
    (r) => () => posicionar(r.antes)
  )
}

function trocarSala(aula, salaId) {
  if (salaId === aula.salaId) return
  const original = aula.id
  registrar(
    `trocar a sala de ${aula.turma} · ${aula.sigla}`,
    () => posicionar([{ aulaId: original, horarioId: aula.horarioId, salaId }]),
    (r) => () => posicionar(r.antes)
  )
}

function trocar(a, b) {
  const [ida, idb] = [a.id, b.id]
  registrar(
    `trocar ${a.sigla} e ${b.sigla}`,
    async () => {
      const r = await http.post(`${base.value}/edicao/trocar`, {
        aulaA: idReal(ida),
        aulaB: idReal(idb),
      })
      aplicarResposta(r)
      return r
    },
    (r) => () => posicionar(r.antes)
  )
}

function marcar(aula, mudanca, descricao, inversa) {
  const original = aula.id
  const enviar = (corpo) => async () => {
    const r = await http.put(`${base.value}/edicao/aulas/${idReal(original)}`, corpo)
    aplicarResposta(r)
    return r
  }
  registrar(descricao, enviar(mudanca), () => enviar(inversa))
}

const alternarFixada = (aula) =>
  marcar(
    aula,
    { fixada: !aula.fixada },
    `${aula.fixada ? 'liberar' : 'fixar'} ${aula.turma} · ${aula.sigla}`,
    { fixada: aula.fixada }
  )
const marcarRevisada = (aula) =>
  marcar(aula, { revisar: false }, `marcar ${aula.turma} · ${aula.sigla} como revisada`, {
    revisar: true,
  })

// Criar e remover trocam ids: o histórico reaponta o id antigo para o novo.
function criarDe(dados, idAnterior = null) {
  return async () => {
    const r = await http.post(`${base.value}/edicao/aulas`, dados)
    if (idAnterior != null) novosIds.set(idAnterior, r.criada)
    aplicarResposta(r)
    return r
  }
}
function removerId(original) {
  return async () => {
    const r = await http.delete(`${base.value}/edicao/aulas/${idReal(original)}`)
    aplicarResposta(r)
    return r
  }
}

function alocar(f, horarioId, salaId) {
  const dados = { atribuicaoId: f.atribuicaoId, horarioId, salaId }
  let original = null
  registrar(
    `alocar ${f.turma} · ${f.sigla}`,
    async () => {
      const r = await criarDe(dados, original)()
      original ??= r.criada
      return r
    },
    () => () => removerId(original)()
  )
}

function remover(aula) {
  const original = aula.id
  const dados = {
    atribuicaoId: aula.atribuicaoId,
    horarioId: aula.horarioId,
    salaId: aula.salaId,
    fixada: aula.fixada,
    revisar: aula.revisar,
  }
  registrar(`tirar ${aula.turma} · ${aula.sigla} da grade`, removerId(original), () =>
    criarDe(dados, original)
  )
}

async function voltar() {
  const item = desfazer.value.at(-1)
  if (!item || ocupado.value) return
  limparSelecao()
  if ((await executar(item.desfazer)) === null) return
  refazer.value.push(desfazer.value.pop())
}

async function avancar() {
  const item = refazer.value.at(-1)
  if (!item || ocupado.value) return
  limparSelecao()
  if ((await executar(item.refazer)) === null) return
  desfazer.value.push(refazer.value.pop())
}

function aoTeclar(evento) {
  if (evento.target.closest?.('input, textarea, select, [contenteditable]')) return
  const ctrl = evento.ctrlKey || evento.metaKey
  if (evento.key === 'Escape') limparSelecao()
  else if (ctrl && evento.key.toLowerCase() === 'z' && !evento.shiftKey) {
    evento.preventDefault()
    voltar()
  } else if (
    ctrl &&
    (evento.key.toLowerCase() === 'y' || (evento.shiftKey && evento.key.toLowerCase() === 'z'))
  ) {
    evento.preventDefault()
    avancar()
  }
}
onMounted(() => window.addEventListener('keydown', aoTeclar))
onBeforeUnmount(() => window.removeEventListener('keydown', aoTeclar))

// ---------- Listas laterais ----------
// Mesma cor de professor dos cartões da grade.
const faixaProfessor = (f) =>
  f.professores[0]?.cor ? { borderLeft: `5px solid ${f.professores[0].cor}` } : undefined

// Na visão por turma, só as aulas não alocadas da turma selecionada.
const faltantesVisiveis = computed(() =>
  visao.value === 'turma'
    ? faltantes.value.filter((f) => f.turmaId === recursoId.value)
    : faltantes.value
)
const totalFaltantes = computed(() => faltantesVisiveis.value.reduce((s, f) => s + f.faltam, 0))
const aRevisar = computed(() => aulas.value.filter((a) => a.revisar))

// ---------- Painel da direita recolhível ----------
// Recolhido, os contadores ficam na barra da grade e abrem o painel na aba certa.
const contadoresDoPainel = computed(() => [
  { aba: 'faltantes', rotulo: 'Não alocadas', total: totalFaltantes.value, variante: 'danger' },
  { aba: 'revisar', rotulo: 'Revisar', total: aRevisar.value.length, variante: 'warning' },
  {
    aba: 'violacoes',
    rotulo: 'Violações',
    total: avaliacao.value?.violacoes.length ?? 0,
    variante: 'outline-danger',
  },
])
function abrirPainel(qual) {
  aba.value = qual
  painelRecolhido.value = false
}

// ---------- Altura da grade ----------
// A grade ocupa o resto da tela, com rolagem própria e cabeçalho fixo.
const areaGrade = ref(null)
const alturaGrade = useAlturaDaGrade(areaGrade, () => [
  carregando.value,
  erro.value,
  versao.value?.publicada,
  painelRecolhido.value,
  menuRecolhido.value,
  visao.value,
])

function irParaAula(a) {
  // Na visão por dias, vai para o turno da aula; nas outras, para a turma dela.
  if (visao.value === 'dias') trocarVisao('dias', horarioPorId.value.get(a.horarioId)?.turnoId)
  else trocarVisao('turma', a.turmaId)
  selecionarAula(a)
}

// ---------- Violações ----------
const pesos = computed(() => Object.fromEntries(restricoes.value.map((r) => [r.codigo, r.peso])))
const aulaPorId = computed(() => new Map(aulas.value.map((a) => [a.id, a])))
const turmaDaAtribuicao = computed(() => new Map(atribuicoes.value.map((a) => [a.id, a.turmaId])))

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
  limparSelecao()
  violacaoSelecionada.value = indice
  destaque.value = new Set(v.aulas)
  const alvo = alvoDaViolacao(v)
  if (alvo && (alvo.tipo !== visao.value || alvo.id !== recursoId.value))
    trocarVisao(alvo.tipo, alvo.id)
}

const violacoesDaAula = computed(() =>
  selecao.value?.tipo === 'aula'
    ? (avaliacao.value?.violacoes ?? []).filter((v) => v.aulas.includes(selecao.value.aula.id))
    : []
)

// Por último: o carregamento imediato usa variáveis declaradas acima.
watch(() => [props.id, periodoStore.ativoId], carregar, { immediate: true })
</script>

<style scoped>
.seletor-recurso {
  width: auto;
  min-width: 10rem;
  max-width: 16rem;
}
.cabecalho-grade h1 {
  max-width: 22rem;
}
.lista {
  max-height: 60vh;
  overflow-y: auto;
}
/* Aula escolhida com o painel recolhido: cartão flutuante no canto da tela. */
.selecao-flutuante {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  width: min(340px, calc(100vw - 2rem));
  max-height: 60vh;
  overflow-y: auto;
  z-index: 1035;
  box-shadow: var(--gf-sombra-forte, 0 0.5rem 1.5rem rgba(0, 0, 0, 0.2));
}
.item-lista {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid var(--bs-border-color);
  border-radius: 0.25rem;
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
  padding: 0.35rem 0.5rem;
  margin-bottom: 0.35rem;
  cursor: pointer;
}
.item-lista.ativo {
  outline: 3px solid var(--bs-primary);
}
.legenda .amostra {
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  border: 1px solid var(--bs-border-color);
  vertical-align: -0.1rem;
  margin-left: 0.5rem;
}
.nivel-livre {
  background: var(--bs-success-bg-subtle);
}
.nivel-flexivel {
  background: var(--bs-warning-bg-subtle);
}
.nivel-rigida {
  background: var(--bs-danger-bg-subtle);
}
.amostra.professor-livre,
.amostra.professor-evitar {
  border-radius: 50%;
  width: 0.7rem;
  height: 0.7rem;
  border: 0;
}
.professor-livre {
  background: var(--bs-success);
}
.professor-evitar {
  background: var(--bs-warning);
}
</style>
