<!--
  F5-07 e F5-08 — Grade clicável de disponibilidade. Cada clique avança o estado:
  livre → prefere evitar → indisponível → livre (preferência só para professor).
  O gestor escolhe o horário e, nele, o professor, a turma ou a sala: cada horário
  tem a própria disponibilidade. O "padrão do período" é o que os professores
  informam pela conta deles e o que os horários novos copiam.
-->
<template>
  <div>
    <header class="mb-3">
      <h1 class="h3 mb-0">Disponibilidade</h1>
      <p class="text-body-secondary mb-0">
        <template v-if="auth.ehGestor">
          Marque os tempos em que cada professor, turma ou sala não pode ter aula. Cada horário tem
          a própria disponibilidade: o que muda num não muda nos outros.
        </template>
        <template v-else>
          Marque os horários em que você não pode dar aula ou prefere evitar. O gestor usa estas
          marcações ao gerar a grade.
        </template>
      </p>
    </header>

    <BAlert v-if="!periodo" :model-value="true" variant="warning"
      >Selecione um período letivo.</BAlert
    >
    <BAlert
      v-else-if="!auth.ehGestor && !auth.usuario?.professorId"
      :model-value="true"
      variant="warning"
    >
      Sua conta não está vinculada a um professor. Peça ao gestor para fazer o vínculo.
    </BAlert>

    <BCard v-if="periodo && auth.ehGestor" class="mb-3" body-class="py-2">
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <label for="escopo" class="fw-semibold mb-0">Horário</label>
        <BFormSelect
          id="escopo"
          :model-value="versaoId"
          :options="opcoesEscopo"
          class="seletor-escopo"
          @update:model-value="trocarEscopo"
        />
        <span class="small text-body-secondary">
          {{
            versaoId
              ? 'Mudanças valem só para este horário e para as próximas gerações dele.'
              : 'Padrão do período: o que os professores informam; horários novos copiam daqui.'
          }}
        </span>
      </div>
      <div v-if="!horarios.length" class="small text-warning-emphasis mt-1">
        Nenhum horário criado ainda. Crie em
        <RouterLink :to="{ name: 'versoes' }">Horários</RouterLink>; até lá, ajuste o padrão do
        período.
      </div>
    </BCard>

    <BRow v-if="periodo && (auth.ehGestor || auth.usuario?.professorId)" class="g-3">
      <BCol v-if="auth.ehGestor" cols="12" lg="3">
        <BCard no-body>
          <div class="p-2 border-bottom">
            <BButtonGroup size="sm" class="w-100 mb-2" aria-label="Tipo de recurso">
              <BButton
                v-for="t in TIPOS"
                :key="t.valor"
                :variant="tipo === t.valor ? 'primary' : 'outline-primary'"
                :pressed="tipo === t.valor"
                @click="trocarTipo(t.valor)"
                >{{ t.rotulo }}</BButton
              >
            </BButtonGroup>
            <BFormInput
              v-model="busca"
              size="sm"
              type="search"
              placeholder="Buscar"
              aria-label="Buscar"
            />
          </div>
          <div class="lista">
            <button
              v-for="r in recursosFiltrados"
              :key="r.id"
              type="button"
              class="item"
              :class="{ ativo: r.id === recursoId }"
              @click="escolher(r.id)"
            >
              {{ r.nome }}
              <span v-if="r.indisponiveis" class="badge text-bg-danger ms-1" title="Indisponível">{{
                r.indisponiveis
              }}</span>
              <span
                v-if="r.preferencias"
                class="badge text-bg-warning ms-1"
                title="Prefere evitar"
                >{{ r.preferencias }}</span
              >
              <span v-if="r.detalhe" class="d-block small text-body-secondary fw-normal">{{
                r.detalhe
              }}</span>
            </button>
            <p v-if="!recursosFiltrados.length" class="small text-body-secondary p-2 mb-0">
              Nada encontrado.
            </p>
          </div>
        </BCard>
      </BCol>

      <BCol cols="12" :lg="auth.ehGestor ? 9 : 12">
        <BAlert :model-value="!!erro" variant="danger" dismissible @update:model-value="erro = ''">
          {{ erro }}
        </BAlert>
        <BAlert
          :model-value="!!sucesso"
          variant="success"
          dismissible
          @update:model-value="sucesso = ''"
        >
          {{ sucesso }}
        </BAlert>

        <BAlert :model-value="!!horarioAtual?.publicada" variant="info">
          Este horário está publicado e a disponibilidade dele não pode ser alterada.
        </BAlert>
        <EditorDoHorario
          v-if="horarioAtual && !horarioAtual.publicada"
          :versao="horarioAtual"
          @atualizado="substituirHorario"
        />
        <BCard v-if="recursoId && gradeHoraria" no-body>
          <div class="d-flex flex-wrap gap-2 align-items-center p-2 border-bottom">
            <strong>{{ nomeRecurso }}</strong>
            <template v-if="turmaAtual">
              <span class="badge text-bg-light border" title="Curso">{{ turmaAtual.curso }}</span>
              <span class="badge text-bg-light border" title="Nível">{{
                turmaAtual.nivelRotulo
              }}</span>
              <span
                class="badge border"
                :class="turmaAtual.turnosDefinidos ? 'text-bg-light' : 'text-bg-warning'"
                :title="
                  turmaAtual.turnosDefinidos
                    ? 'Turnos da turma'
                    : 'Turnos ainda não definidos: a turma aceita todos. Ajuste em Dados.'
                "
                >{{ turmaAtual.turnosRotulo }}</span
              >
            </template>
            <span class="small text-body-secondary">
              {{ contagem.indisponivel }} indisponível(is)<template v-if="tipo === 'professor'"
                >, {{ contagem.evitar }} a evitar</template
              >
            </span>
            <span v-if="alterado" class="badge text-bg-warning">alterações não salvas</span>
            <div class="ms-auto d-flex flex-wrap gap-2">
              <BButton
                v-if="versaoId"
                size="sm"
                variant="outline-secondary"
                :disabled="salvando || somenteLeitura"
                title="Copia para este horário o que está no padrão do período"
                @click="usarPadrao"
                >Usar o padrão</BButton
              >
              <BButton
                size="sm"
                variant="outline-secondary"
                :disabled="!alterado || salvando"
                @click="descartar"
                >Descartar</BButton
              >
              <BButton
                size="sm"
                variant="outline-secondary"
                :disabled="salvando || somenteLeitura"
                @click="limpar"
                >Limpar tudo</BButton
              >
              <BButton
                size="sm"
                variant="primary"
                :disabled="!alterado || salvando || somenteLeitura"
                @click="salvar"
              >
                <BSpinner v-if="salvando" small class="me-1" />Salvar
              </BButton>
            </div>
          </div>
          <div
            class="d-flex flex-wrap gap-2 align-items-center px-2 pt-2"
            role="group"
            aria-label="Turno inteiro indisponível"
          >
            <span class="small fw-semibold">Turno inteiro indisponível:</span>
            <BButton
              v-for="turno in gradeHoraria.turnos"
              :key="turno.id"
              size="sm"
              :variant="turnoIndisponivel(turno.id) ? 'danger' : 'outline-danger'"
              :pressed="turnoIndisponivel(turno.id)"
              :disabled="salvando || somenteLeitura"
              :title="
                turnoIndisponivel(turno.id)
                  ? `Liberar o ${turno.nome} inteiro`
                  : `Marcar o ${turno.nome} inteiro como indisponível, em todos os dias`
              "
              @click="alternarTurno(turno.id)"
            >
              {{ turnoIndisponivel(turno.id) ? '✕ ' : '' }}{{ turno.nome }}
            </BButton>
          </div>
          <div class="legenda small px-2 pt-2">
            Clique para alternar:
            <span class="amostra livre"></span> livre
            <template v-if="tipo === 'professor'">
              <span class="amostra evitar"></span> prefere evitar</template
            >
            <span class="amostra indisponivel"></span> indisponível. Clique no dia ou no turno para
            marcar todos.
          </div>
          <div class="table-responsive p-2">
            <table class="table table-bordered table-sm grade mb-0">
              <thead>
                <tr>
                  <th scope="col" class="coluna-tempo">Tempo</th>
                  <th v-for="d in gradeHoraria.dias" :key="d" scope="col" class="text-center">
                    <button
                      type="button"
                      class="cabecalho"
                      :title="`Marcar ${DIAS[d]} inteira`"
                      @click="alternarGrupo((h) => h.diaSemana === d)"
                    >
                      {{ DIAS[d] }}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody v-for="turno in gradeHoraria.turnos" :key="turno.id">
                <tr class="table-light">
                  <th :colspan="gradeHoraria.dias.length + 1" scope="rowgroup">
                    <button
                      type="button"
                      class="cabecalho small"
                      :title="`Marcar o ${turno.nome} inteiro`"
                      @click="alternarGrupo((h) => h.turnoId === turno.id)"
                    >
                      {{ turno.nome }}
                    </button>
                  </th>
                </tr>
                <tr v-for="tempo in turno.tempos" :key="tempo.ordem">
                  <th scope="row" class="coluna-tempo small fw-normal text-body-secondary">
                    <div class="fw-semibold text-body">{{ tempo.ordem }}º</div>
                    {{ tempo.horaInicio }}–{{ tempo.horaFim }}
                  </th>
                  <td v-for="d in gradeHoraria.dias" :key="d" class="p-0">
                    <button
                      v-if="horarioDe(turno.id, d, tempo.ordem)"
                      type="button"
                      class="celula"
                      :class="estadoDe(horarioDe(turno.id, d, tempo.ordem))"
                      :aria-label="`${DIAS[d]}, ${tempo.ordem}º tempo do ${turno.nome}: ${ROTULOS[estadoDe(horarioDe(turno.id, d, tempo.ordem))]}`"
                      :title="motivoDe(horarioDe(turno.id, d, tempo.ordem))"
                      @click="alternar(horarioDe(turno.id, d, tempo.ordem))"
                    >
                      {{ SIMBOLOS[estadoDe(horarioDe(turno.id, d, tempo.ordem))] }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </BCard>
        <p v-else-if="auth.ehGestor" class="text-body-secondary">Escolha um recurso na lista.</p>
      </BCol>
    </BRow>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  BAlert,
  BButton,
  BButtonGroup,
  BCard,
  BCol,
  BFormInput,
  BFormSelect,
  BRow,
  BSpinner,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import EditorDoHorario from '@/components/EditorDoHorario.vue'
import { usePeriodoStore } from '@/stores/periodo'
import { DIAS } from '@/utils/formato'
import { normalizar } from '@/utils/texto'

const TIPOS = [
  { valor: 'professor', rotulo: 'Professor' },
  { valor: 'turma', rotulo: 'Turma' },
  { valor: 'sala', rotulo: 'Sala' },
]
const ROTULOS = { livre: 'livre', evitar: 'prefere evitar', indisponivel: 'indisponível' }
const SIMBOLOS = { livre: '', evitar: '~', indisponivel: '✕' }

const auth = useAuthStore()
const periodoStore = usePeriodoStore()
const periodo = computed(() => periodoStore.ativo)
const base = computed(() => `/periodos/${periodo.value?.id}/disponibilidade`)
const rota = useRoute()
const router = useRouter()

// Escopo: um horário (versaoId) ou o padrão do período (null). O professor só usa o padrão.
const horarios = ref([])
const versaoId = ref(null)
const escopo = computed(() => (versaoId.value ? `?versao=${versaoId.value}` : ''))
const horarioAtual = computed(() => horarios.value.find((h) => h.id === versaoId.value) ?? null)
// A disponibilidade de um horário só é alterada pelo editor dele (e não se publicado).
const somenteLeitura = computed(
  () =>
    !!horarioAtual.value && (horarioAtual.value.publicada || !auth.ehEditorDe(horarioAtual.value))
)
function substituirHorario(atualizado) {
  horarios.value = horarios.value.map((h) => (h.id === atualizado.id ? atualizado : h))
}
const opcoesEscopo = computed(() => [
  ...horarios.value.map((h) => ({
    value: h.id,
    text: `${h.nome}${h.publicada ? ' (publicado)' : ''}`,
  })),
  { value: null, text: 'Padrão do período (informado pelos professores)' },
])

const tipo = ref('professor')
const recursos = ref([])
const recursoId = ref(null)
const busca = ref('')
const gradeHoraria = ref(null)
const marcacoes = ref(new Map()) // horarioId → { rigida, motivo }
const original = ref(new Map())
const erro = ref('')
const sucesso = ref('')
const salvando = ref(false)

const recursosFiltrados = computed(() => {
  const termo = normalizar(busca.value)
  return recursos.value.filter(
    (r) => !termo || normalizar(`${r.nome} ${r.detalhe ?? ''}`).includes(termo)
  )
})
const recursoAtual = computed(() => recursos.value.find((r) => r.id === recursoId.value) ?? null)
const nomeRecurso = computed(() => recursoAtual.value?.nome ?? '')
const turmaAtual = computed(() => (tipo.value === 'turma' ? recursoAtual.value : null))

// Turma: código, e abaixo curso · nível · turnos.
const NIVEIS = { integrado: 'Integrado', subsequente: 'Subsequente', superior: 'Superior' }
function paraTurma(t) {
  const nomesTurnos = (gradeHoraria.value?.turnos ?? [])
    .filter((x) => (t.turnos ?? []).includes(x.id))
    .map((x) => x.nome)
  const turnosRotulo = t.turnosDefinidos ? nomesTurnos.join(', ') || 'sem turno' : 'Turno a definir'
  const nivelRotulo = NIVEIS[t.nivel] ?? t.nivel ?? ''
  return {
    id: t.id,
    nome: t.codigo,
    curso: t.curso ?? '',
    nivelRotulo,
    turnosDefinidos: !!t.turnosDefinidos,
    turnosRotulo,
    detalhe: [t.curso, nivelRotulo, turnosRotulo].filter(Boolean).join(' · '),
  }
}

const horarioPorPosicao = computed(
  () =>
    new Map(
      (gradeHoraria.value?.horarios ?? []).map((h) => [
        `${h.turnoId}|${h.diaSemana}|${h.ordem}`,
        h.id,
      ])
    )
)
const horarioDe = (turno, dia, ordem) => horarioPorPosicao.value.get(`${turno}|${dia}|${ordem}`)

function estadoDe(horarioId) {
  const m = marcacoes.value.get(horarioId)
  if (!m) return 'livre'
  return m.rigida ? 'indisponivel' : 'evitar'
}
const motivoDe = (horarioId) => marcacoes.value.get(horarioId)?.motivo ?? undefined

const contagem = computed(() => {
  let indisponivel = 0
  let evitar = 0
  for (const m of marcacoes.value.values()) m.rigida ? indisponivel++ : evitar++
  return { indisponivel, evitar }
})

const chave = (mapa) =>
  JSON.stringify([...mapa].map(([h, m]) => [h, m.rigida]).sort((x, y) => x[0] - y[0]))
const alterado = computed(() => chave(marcacoes.value) !== chave(original.value))

// ---------- Carregamento ----------
async function carregarRecursos() {
  recursos.value = []
  if (!periodo.value) return
  try {
    if (tipo.value === 'professor') {
      recursos.value = await http.get(`${base.value}/professores${escopo.value}`)
    } else {
      const lista = await http.get(
        `/periodos/${periodo.value.id}/dados/${tipo.value === 'turma' ? 'turmas' : 'salas'}`
      )
      recursos.value = lista.map((r) =>
        tipo.value === 'turma' ? paraTurma(r) : { id: r.id, nome: r.codigo ?? r.nome }
      )
    }
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}

async function carregarMarcacoes() {
  marcacoes.value = new Map()
  original.value = new Map()
  if (!recursoId.value) return
  try {
    const { itens } = await http.get(
      `${base.value}/${tipo.value}/${recursoId.value}${escopo.value}`
    )
    const mapa = new Map(itens.map((i) => [i.horarioId, { rigida: i.rigida, motivo: i.motivo }]))
    marcacoes.value = mapa
    original.value = new Map(mapa)
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}

const podeSair = () =>
  !alterado.value || window.confirm('Há alterações não salvas. Sair mesmo assim?')

watch(
  () => periodo.value?.id,
  async (id) => {
    gradeHoraria.value = null
    if (!id) return
    try {
      gradeHoraria.value = await http.get(`/periodos/${id}/grade-horaria`)
      if (auth.ehGestor) {
        horarios.value = await http.get(`/periodos/${id}/versoes`)
        // ?horario=<id> (vindo da tela do horário) ou o primeiro horário não publicado.
        const pedido = Number(rota.query.horario)
        versaoId.value =
          horarios.value.find((h) => h.id === pedido)?.id ??
          horarios.value.find((h) => !h.publicada)?.id ??
          horarios.value[0]?.id ??
          null
      }
    } catch (e) {
      erro.value = mensagemDeErro(e)
    }
    await carregarRecursos()
    if (!auth.ehGestor) recursoId.value = auth.usuario?.professorId ?? null
    else if (!recursos.value.some((r) => r.id === recursoId.value)) recursoId.value = null
    await carregarMarcacoes()
  },
  { immediate: true }
)

async function trocarEscopo(novo) {
  if (novo === versaoId.value || !podeSair()) return
  versaoId.value = novo
  sucesso.value = ''
  router.replace({ query: { ...rota.query, horario: novo ?? undefined } })
  await carregarRecursos()
  await carregarMarcacoes()
}

async function trocarTipo(novo) {
  if (novo === tipo.value || !podeSair()) return
  tipo.value = novo
  recursoId.value = null
  await carregarRecursos()
  await carregarMarcacoes()
}

async function escolher(id) {
  if (id === recursoId.value || !podeSair()) return
  recursoId.value = id
  sucesso.value = ''
  await carregarMarcacoes()
}

onBeforeRouteLeave(() => podeSair())

// ---------- Edição ----------
function proximoEstado(atual) {
  if (tipo.value !== 'professor') return atual === 'livre' ? 'indisponivel' : 'livre'
  return { livre: 'evitar', evitar: 'indisponivel', indisponivel: 'livre' }[atual]
}

function definir(mapa, horarioId, estado) {
  if (estado === 'livre') mapa.delete(horarioId)
  else
    mapa.set(horarioId, {
      rigida: estado === 'indisponivel',
      motivo: original.value.get(horarioId)?.motivo ?? null,
    })
}

function alternar(horarioId) {
  if (somenteLeitura.value) return
  const mapa = new Map(marcacoes.value)
  definir(mapa, horarioId, proximoEstado(estadoDe(horarioId)))
  marcacoes.value = mapa
}

// Dia ou turno inteiro: marca tudo como indisponível; se já estiver, libera tudo.
function alternarGrupo(filtro) {
  if (somenteLeitura.value) return
  const ids = gradeHoraria.value.horarios.filter(filtro).map((h) => h.id)
  const todos = ids.every((id) => estadoDe(id) === 'indisponivel')
  const mapa = new Map(marcacoes.value)
  for (const id of ids) definir(mapa, id, todos ? 'livre' : 'indisponivel')
  marcacoes.value = mapa
}

// Turno inteiro (todos os dias): um clique marca como indisponível; outro libera.
const horariosDoTurno = (turnoId) =>
  (gradeHoraria.value?.horarios ?? []).filter((h) => h.turnoId === turnoId)

function turnoIndisponivel(turnoId) {
  const lista = horariosDoTurno(turnoId)
  return lista.length > 0 && lista.every((h) => estadoDe(h.id) === 'indisponivel')
}

const alternarTurno = (turnoId) => alternarGrupo((h) => h.turnoId === turnoId)

function limpar() {
  marcacoes.value = new Map()
}

function descartar() {
  marcacoes.value = new Map(original.value)
}

async function salvar() {
  salvando.value = true
  erro.value = ''
  sucesso.value = ''
  try {
    const itens = [...marcacoes.value].map(([horarioId, m]) => ({
      horarioId,
      rigida: m.rigida,
      motivo: m.motivo,
    }))
    const r = await http.put(`${base.value}/${tipo.value}/${recursoId.value}${escopo.value}`, {
      itens,
    })
    const mapa = new Map(r.itens.map((i) => [i.horarioId, { rigida: i.rigida, motivo: i.motivo }]))
    marcacoes.value = mapa
    original.value = new Map(mapa)
    sucesso.value = horarioAtual.value
      ? `Disponibilidade de ${r.recurso.nome} salva no horário ${horarioAtual.value.nome}.`
      : `Disponibilidade padrão de ${r.recurso.nome} salva.`
    const item = recursos.value.find((x) => x.id === recursoId.value)
    if (item)
      Object.assign(item, {
        indisponiveis: contagem.value.indisponivel,
        preferencias: contagem.value.evitar,
      })
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    salvando.value = false
  }
}

// Traz para o horário o que está no padrão do período para o recurso aberto.
async function usarPadrao() {
  salvando.value = true
  erro.value = ''
  sucesso.value = ''
  try {
    const r = await http.post(
      `${base.value}/${tipo.value}/${recursoId.value}/usar-padrao${escopo.value}`
    )
    const mapa = new Map(r.itens.map((i) => [i.horarioId, { rigida: i.rigida, motivo: i.motivo }]))
    marcacoes.value = mapa
    original.value = new Map(mapa)
    sucesso.value = `${r.recurso.nome} voltou ao padrão do período neste horário.`
    await carregarRecursos()
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    salvando.value = false
  }
}
</script>

<style scoped>
.seletor-escopo {
  width: auto;
  min-width: 16rem;
}
.lista {
  max-height: 65vh;
  overflow-y: auto;
}
.item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--bs-border-color);
  background: transparent;
  color: var(--bs-body-color);
  padding: 0.4rem 0.6rem;
}
.item.ativo {
  background: var(--bs-primary-bg-subtle);
  font-weight: 600;
}
.grade {
  table-layout: fixed;
  min-width: 560px;
}
.coluna-tempo {
  width: 6.5rem;
}
.cabecalho {
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 600;
  padding: 0;
}
.celula {
  display: block;
  width: 100%;
  height: 2.6rem;
  border: 0;
  font-weight: 700;
}
.livre {
  background: var(--bs-body-bg);
}
.evitar {
  background: var(--bs-warning-bg-subtle);
  color: var(--bs-warning-text-emphasis);
}
.indisponivel {
  background: var(--bs-danger-bg-subtle);
  color: var(--bs-danger-text-emphasis);
}
.amostra {
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  border: 1px solid var(--bs-border-color);
  vertical-align: -0.1rem;
  margin-left: 0.4rem;
}
</style>
