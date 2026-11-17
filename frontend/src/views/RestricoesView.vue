<template>
  <div>
    <header class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 class="h3 mb-0">Restrições</h1>
        <p class="text-body-secondary mb-0">
          Regras que o solver cumpre e pesos das preferências{{
            periodo ? ` no período ${periodo.nome}` : ''
          }}. As mudanças valem para as próximas gerações e avaliações.
        </p>
      </div>
      <BButton
        v-if="periodo"
        variant="outline-secondary"
        size="sm"
        :disabled="carregando"
        @click="confirmarRestauracao = true"
      >
        Restaurar valores iniciais
      </BButton>
    </header>

    <BAlert v-if="!periodo" :model-value="true" variant="warning"
      >Selecione um período letivo.</BAlert
    >

    <template v-else>
      <BAlert :model-value="!!erro" variant="danger" dismissible @update:model-value="erro = ''">
        {{ erro }}
      </BAlert>

      <div v-if="carregando" class="text-center py-5"><BSpinner label="Carregando" /></div>

      <BRow v-else class="g-3">
        <BCol cols="12" xl="5">
          <BCard header-tag="h2" header-class="h6 mb-0" header="Rígidas" no-body>
            <p class="small text-body-secondary px-3 pt-3 mb-2">
              Toda grade válida cumpre estas regras. Desative só quando a regra não se aplicar ao
              campus (por exemplo, R7 sem cadastro de salas).
            </p>
            <BListGroup flush>
              <BListGroupItem v-for="r in rigidas" :key="r.codigo">
                <div class="d-flex align-items-start gap-2">
                  <BFormCheckbox
                    :model-value="r.ativa"
                    switch
                    :disabled="salvando[r.codigo]"
                    :aria-label="`Ativar ${r.nome}`"
                    @update:model-value="salvar(r, { ativa: $event })"
                  />
                  <div class="flex-grow-1">
                    <div>
                      <span class="badge text-bg-dark me-1">{{ r.codigo }}</span>
                      <strong>{{ r.nome }}</strong>
                    </div>
                    <div class="small text-body-secondary">{{ r.descricao }}</div>
                    <div v-if="!r.ativa" class="small text-danger mt-1">
                      Desativada: o solver pode gerar grades que violam esta regra.
                    </div>
                  </div>
                </div>
              </BListGroupItem>
            </BListGroup>
          </BCard>
        </BCol>

        <BCol cols="12" xl="7">
          <BCard header-tag="h2" header-class="h6 mb-0" header="Flexíveis" no-body>
            <p class="small text-body-secondary px-3 pt-3 mb-2">
              Cada violação soma o peso à pontuação da grade, e o solver busca a menor soma. Peso 10
              é quase obrigatório; peso 1, só desempate.
            </p>
            <BListGroup flush>
              <BListGroupItem v-for="r in flexiveis" :key="r.codigo">
                <div class="d-flex align-items-start gap-2">
                  <BFormCheckbox
                    :model-value="r.ativa"
                    switch
                    :disabled="salvando[r.codigo]"
                    :aria-label="`Ativar ${r.nome}`"
                    @update:model-value="salvar(r, { ativa: $event })"
                  />
                  <div class="flex-grow-1">
                    <div class="d-flex flex-wrap justify-content-between gap-2">
                      <div>
                        <span class="badge text-bg-secondary me-1">{{ r.codigo }}</span>
                        <strong>{{ r.nome }}</strong>
                        <BSpinner v-if="salvando[r.codigo]" small class="ms-2" />
                      </div>
                      <div
                        class="d-flex align-items-center gap-2 peso"
                        :class="{ 'opacity-50': !r.ativa }"
                      >
                        <label :for="`peso-${r.codigo}`" class="small text-body-secondary"
                          >Peso</label
                        >
                        <input
                          :id="`peso-${r.codigo}`"
                          type="range"
                          class="form-range"
                          min="1"
                          max="10"
                          :value="r.peso"
                          :disabled="!r.ativa || salvando[r.codigo]"
                          @input="r.peso = Number($event.target.value)"
                          @change="salvar(r, { peso: Number($event.target.value) })"
                        />
                        <span class="fw-semibold valor-peso">{{ r.peso }}</span>
                      </div>
                    </div>
                    <div class="small text-body-secondary">
                      {{ r.descricao }}
                      <span v-if="r.peso !== r.padrao.peso" class="ms-1"
                        >(inicial: {{ r.padrao.peso }})</span
                      >
                    </div>

                    <div v-if="PARAMETROS[r.codigo] && r.ativa" class="row g-2 mt-1">
                      <div v-for="p in PARAMETROS[r.codigo]" :key="p.campo" class="col-12 col-sm-6">
                        <label :for="`${r.codigo}-${p.campo}`" class="form-label small mb-1">{{
                          p.rotulo
                        }}</label>
                        <BFormSelect
                          v-if="p.tipo === 'turno'"
                          :id="`${r.codigo}-${p.campo}`"
                          size="sm"
                          :model-value="r.parametros[p.campo] ?? null"
                          :options="[
                            { value: null, text: 'Reconhecer pelo nome' },
                            ...opcoesTurnos,
                          ]"
                          @update:model-value="salvarParametro(r, p.campo, $event)"
                        />
                        <BFormInput
                          v-else
                          :id="`${r.codigo}-${p.campo}`"
                          type="number"
                          size="sm"
                          :min="p.min"
                          :max="p.max"
                          :model-value="r.parametros[p.campo]"
                          :state="errosParametros[`${r.codigo}.${p.campo}`] ? false : null"
                          @change="salvarParametro(r, p.campo, valorNumerico($event))"
                        />
                        <div class="form-text">
                          {{ errosParametros[`${r.codigo}.${p.campo}`] ?? p.ajuda }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </BListGroupItem>
            </BListGroup>
          </BCard>
        </BCol>
      </BRow>
    </template>

    <BModal
      v-model="confirmarRestauracao"
      title="Restaurar valores iniciais"
      ok-title="Restaurar"
      cancel-title="Cancelar"
      @ok="restaurar"
    >
      Todas as restrições voltam a ficar ativas, com os pesos e parâmetros iniciais da descrição do
      sistema. Versões já geradas não mudam.
    </BModal>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  BAlert,
  BButton,
  BCard,
  BCol,
  BFormCheckbox,
  BFormInput,
  BFormSelect,
  BListGroup,
  BListGroupItem,
  BModal,
  BRow,
  BSpinner,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'

// Parâmetros editáveis (os mesmos aceitos pela API em servicos/restricoes.js).
const PARAMETROS = {
  F3: [
    {
      campo: 'primeirosTempos',
      rotulo: 'Tempos iniciais da manhã',
      min: 1,
      max: 10,
      ajuda: 'Dar aula nestes tempos depois de lecionar à noite conta como violação.',
    },
    { campo: 'turnoNoite', rotulo: 'Turno da noite', tipo: 'turno' },
    { campo: 'turnoManha', rotulo: 'Turno da manhã', tipo: 'turno' },
  ],
  F4: [
    {
      campo: 'maximoPorDia',
      rotulo: 'Máximo por dia',
      min: 1,
      max: 10,
      ajuda: 'Aulas da mesma disciplina por dia na turma.',
    },
  ],
  F7: [
    {
      campo: 'aulasPorDia',
      rotulo: 'Aulas por dia de referência',
      min: 1,
      max: 20,
      ajuda: 'Mínimo de dias = aulas da semana ÷ este número.',
    },
  ],
  F9: [
    {
      campo: 'maximoPorDia',
      rotulo: 'Máximo por dia',
      min: 1,
      max: 20,
      ajuda: 'Aulas do professor por dia.',
    },
  ],
}

const periodoStore = usePeriodoStore()
const periodo = computed(() => periodoStore.ativo)

const restricoes = ref([])
const turnos = ref([])
const carregando = ref(false)
const erro = ref('')
const salvando = reactive({})
const errosParametros = reactive({})
const confirmarRestauracao = ref(false)

const rigidas = computed(() => restricoes.value.filter((r) => r.tipo === 'rigida'))
const flexiveis = computed(() => restricoes.value.filter((r) => r.tipo === 'flexivel'))
const opcoesTurnos = computed(() => turnos.value.map((t) => ({ value: t.id, text: t.nome })))
const base = computed(() => `/periodos/${periodo.value?.id}/restricoes`)

watch(
  () => periodo.value?.id,
  async (id) => {
    restricoes.value = []
    if (!id) return
    carregando.value = true
    erro.value = ''
    try {
      const [lista, grade] = await Promise.all([
        http.get(base.value),
        http.get(`/periodos/${id}/grade-horaria`),
      ])
      restricoes.value = lista
      turnos.value = grade.turnos
    } catch (e) {
      erro.value = mensagemDeErro(e)
    } finally {
      carregando.value = false
    }
  },
  { immediate: true }
)

function substituir(atualizada) {
  const i = restricoes.value.findIndex((x) => x.codigo === atualizada.codigo)
  if (i >= 0) restricoes.value.splice(i, 1, atualizada)
}

async function salvar(r, alteracao) {
  salvando[r.codigo] = true
  erro.value = ''
  for (const chave of Object.keys(errosParametros))
    if (chave.startsWith(`${r.codigo}.`)) delete errosParametros[chave]
  try {
    substituir(await http.put(`${base.value}/${r.codigo}`, alteracao))
  } catch (e) {
    const detalhes = Array.isArray(e.detalhes) ? e.detalhes : []
    const doParametro = detalhes.filter((d) => d.campo?.startsWith('parametros.'))
    for (const d of doParametro)
      errosParametros[`${r.codigo}.${d.campo.replace('parametros.', '')}`] = d.mensagem
    if (!doParametro.length) erro.value = `${r.codigo}: ${mensagemDeErro(e)}`
    // Volta a mostrar o que está gravado.
    try {
      substituir((await http.get(base.value)).find((x) => x.codigo === r.codigo))
    } catch {
      /* a mensagem de erro já está na tela */
    }
  } finally {
    salvando[r.codigo] = false
  }
}

// O BFormInput emite o evento nativo no "change"; aceita também o valor direto.
const valorNumerico = (e) => Number(e?.target ? e.target.value : e)

function salvarParametro(r, campo, valor) {
  salvar(r, { parametros: { ...r.parametros, [campo]: valor } })
}

async function restaurar() {
  erro.value = ''
  try {
    restricoes.value = await http.post(`${base.value}/restaurar`)
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}
</script>

<style scoped>
.peso {
  min-width: 220px;
}
.peso .form-range {
  width: 140px;
}
.valor-peso {
  width: 1.5rem;
  text-align: right;
}
</style>
