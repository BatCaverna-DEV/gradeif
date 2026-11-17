<template>
  <div>
    <header class="mb-4">
      <h1 class="h3 mb-0">Importação</h1>
      <p class="text-body-secondary mb-0">
        Os dados do semestre entram por uma planilha de oferta: uma linha por disciplina de cada
        turma, com o professor. Professores, disciplinas, turmas e cursos novos são criados a partir
        dela. Nada é gravado sem passar pela prévia.
      </p>
    </header>

    <BAlert v-if="!periodo" :model-value="true" variant="warning"
      >Selecione um período letivo para importar.</BAlert
    >

    <template v-if="periodo">
      <BRow class="g-3 mb-3">
        <BCol cols="12" lg="5">
          <BCard class="h-100">
            <h2 class="h6">1. Prepare a planilha de oferta</h2>
            <p class="small text-body-secondary mb-2">
              Colunas:
              <strong>Semestre, Turma, Curso, Período, Disciplina, Aulas/semana e Professor</strong
              >. Opcionais: Turno, Alunos, Tamanho do bloco e Sigla. CSV separado por ponto e
              vírgula ou XLSX.
            </p>
            <ul class="small text-body-secondary ps-3 mb-2">
              <li>Professor e disciplina são reconhecidos pelo nome; a sigla é gerada.</li>
              <li>
                Sem a coluna Turno, a turma nova aceita todos os turnos: defina o turno depois em
                Dados.
              </li>
              <li>
                Disciplina com 2 ou mais aulas usa blocos geminados de 2, ajustáveis em Dados.
              </li>
            </ul>
            <div class="d-flex flex-wrap gap-2 align-items-center">
              <BButton
                href="/api/importacoes/modelos/oferta"
                variant="outline-primary"
                size="sm"
                download
              >
                Modelo da oferta
              </BButton>
              <a href="/api/importacoes/modelos/salas" class="small" download
                >Modelo de salas (opcional)</a
              >
              <a href="/api/importacoes/modelos/professores" class="small" download
                >Modelo de professores (opcional)</a
              >
            </div>
            <p class="small text-body-secondary mt-2 mb-0">
              <strong>Professores:</strong> a planilha com Nome, SIAPE, E-mail e Carga máxima
              semanal completa o cadastro de quem veio da oferta (reconhecido pelo SIAPE ou, sem
              ele, pelo nome) e cadastra quem ainda não existe. Envie-a sozinha, depois da oferta.
            </p>
          </BCard>
        </BCol>

        <BCol cols="12" lg="7">
          <BCard class="h-100">
            <h2 class="h6">2. Envie a planilha do período {{ periodo.nome }}</h2>
            <p class="small text-body-secondary">
              Um arquivo .xlsx ou .csv: a oferta (com a de salas junto, se quiser) ou a de
              professores. O tipo é reconhecido pelos cabeçalhos. Reenviar a planilha corrigida
              atualiza sem duplicar.
            </p>
            <div class="mb-2">
              <label for="destino" class="form-label small fw-semibold mb-1">Importar em</label>
              <BFormSelect
                id="destino"
                v-model="destinoId"
                :options="opcoesDestino"
                size="sm"
                :disabled="!!ocupado"
              />
              <div class="form-text">
                {{
                  destinoId
                    ? 'Atualiza a oferta do período e gera as atribuições neste horário. Atribuições do horário que não estão no arquivo ficam como estão.'
                    : 'Só a oferta do período: os horários existentes não mudam; traga as atribuições depois em cada horário.'
                }}
              </div>
            </div>
            <BForm class="d-flex flex-wrap gap-2 align-items-start" @submit.prevent="validar">
              <BFormFile
                v-model="selecionados"
                multiple
                accept=".xlsx,.csv"
                placeholder="Nenhum arquivo escolhido"
                browse-text="Escolher"
                class="flex-grow-1 campo-arquivo"
                aria-label="Arquivos de importação"
              />
              <BButton
                type="submit"
                variant="primary"
                :disabled="!listaArquivos.length || !!ocupado"
              >
                <BSpinner v-if="ocupado === 'validar'" small class="me-2" />
                Validar
              </BButton>
            </BForm>
          </BCard>
        </BCol>
      </BRow>

      <BAlert :model-value="!!erro" variant="danger">{{ erro }}</BAlert>
      <BAlert
        :model-value="!!sucesso"
        variant="success"
        dismissible
        @update:model-value="sucesso = ''"
      >
        {{ sucesso }}
      </BAlert>

      <section v-if="previa" class="mb-4" aria-labelledby="titulo-previa">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
          <h2 id="titulo-previa" class="h5 mb-0">3. Confira a prévia</h2>
          <BButton
            variant="primary"
            class="ms-auto"
            :disabled="!previa.podeConfirmar || !!ocupado"
            @click="confirmar"
          >
            <BSpinner v-if="ocupado === 'confirmar'" small class="me-2" />
            Gravar importação
          </BButton>
        </div>

        <BAlert :model-value="true" :variant="situacaoGeral.cor">{{ situacaoGeral.texto }}</BAlert>
        <BAlert v-if="previa.horario" :model-value="true" variant="info">
          <strong>No horário {{ previa.horario.nome }}:</strong>
          {{ previa.horario.adicionar }} atribuição(ões) a adicionar,
          {{ previa.horario.atualizar }} a atualizar e {{ previa.horario.iguais }} já igual(is).
          <template v-if="previa.horario.aulasParaRevisar">
            {{ previa.horario.aulasParaRevisar }} aula(s) já alocada(s) nas atribuições alteradas
            serão marcadas para revisão.
          </template>
        </BAlert>
        <BAlert :model-value="previa.impacto?.aulas > 0" variant="warning">
          {{ previa.impacto.aulas }} aula(s) já alocada(s) em
          {{ previa.impacto.versoes }} versão(ões) da grade serão marcadas para revisão. Elas não
          serão apagadas.
        </BAlert>

        <RelatorioArquivo v-for="a in previa.arquivos" :key="a.arquivo" :arquivo="a" />
      </section>

      <BCard no-body>
        <BCardHeader class="d-flex align-items-center">
          <h2 class="h6 mb-0">Histórico do período</h2>
        </BCardHeader>
        <BTable
          :items="historico"
          :fields="camposHistorico"
          :busy="carregandoHistorico"
          show-empty
          empty-text="Nenhuma importação gravada neste período."
          small
          responsive
          class="mb-0"
        >
          <template #cell(criadoEm)="{ item }">{{ formatarData(item.criadoEm) }}</template>
          <template #cell(tipo)="{ item }">{{ tituloDo(item.tipo) }}</template>
          <template #cell(acoes)="{ item }">
            <BButton size="sm" variant="link" class="p-0" @click="abrirRelatorio(item)"
              >Ver relatório</BButton
            >
          </template>
        </BTable>
      </BCard>
    </template>

    <BModal
      v-model="relatorioVisivel"
      :title="relatorioTitulo"
      size="xl"
      ok-only
      ok-title="Fechar"
      scrollable
    >
      <div v-if="!relatorio" class="text-center py-4"><BSpinner /></div>
      <RelatorioArquivo v-else :arquivo="relatorio" />
    </BModal>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  BAlert,
  BButton,
  BCard,
  BCardHeader,
  BCol,
  BForm,
  BFormFile,
  BFormSelect,
  BModal,
  BRow,
  BSpinner,
  BTable,
} from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'
import RelatorioArquivo from '@/components/RelatorioArquivo.vue'

const TITULOS = {
  oferta: 'Oferta do semestre',
  salas: 'Salas',
  professores: 'Professores',
  disciplinas: 'Disciplinas',
  turmas: 'Turmas',
  atribuicoes: 'Atribuições',
}
const tituloDo = (tipo) => TITULOS[tipo] ?? tipo

const periodoStore = usePeriodoStore()
const periodo = computed(() => periodoStore.ativo)
const base = computed(() => `/periodos/${periodo.value?.id}/importacoes`)
const rota = useRoute()

// Destino: um horário (a oferta do período + as atribuições dele) ou só a oferta.
const horarios = ref([])
const destinoId = ref(null)
const opcoesDestino = computed(() => [
  ...horarios.value
    .filter((h) => !h.publicada)
    .map((h) => ({ value: h.id, text: `Horário: ${h.nome}` })),
  { value: null, text: 'Só a oferta do período (nenhum horário)' },
])
const sufixoDestino = computed(() => (destinoId.value ? `?versao=${destinoId.value}` : ''))

async function carregarHorarios() {
  horarios.value = []
  try {
    horarios.value = await http.get(`/periodos/${periodo.value.id}/versoes`)
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
  // ?horario=<id> (vindo das atribuições do horário) ou o primeiro não publicado.
  const abertos = horarios.value.filter((h) => !h.publicada)
  const pedido = Number(rota.query.horario)
  destinoId.value = abertos.find((h) => h.id === pedido)?.id ?? abertos[0]?.id ?? null
}

const selecionados = ref(null)
const listaArquivos = computed(() => {
  const v = selecionados.value
  if (!v) return []
  return Array.isArray(v) ? v : [v]
})

const previa = ref(null)
const ocupado = ref('')
const erro = ref('')
const sucesso = ref('')

// A prévia vale para os arquivos e o destino que a geraram; trocou, some.
watch([selecionados, destinoId], () => {
  previa.value = null
  erro.value = ''
})

const situacaoGeral = computed(() => {
  const p = previa.value
  const soma = (campo) => p.arquivos.reduce((s, a) => s + (a.resumo?.[campo] ?? 0), 0)
  const rejeitadas = soma('rejeitar')
  const comErro = p.arquivos.filter((a) => a.erro).length
  if (comErro || rejeitadas) {
    const partes = []
    if (comErro) partes.push(`${comErro} arquivo(s) não puderam ser lidos`)
    if (rejeitadas) partes.push(`${rejeitadas} linha(s) rejeitada(s)`)
    return {
      cor: 'danger',
      texto: `${partes.join(' e ')}. Corrija a planilha e envie de novo; nada será gravado enquanto houver rejeição.`,
    }
  }
  if (!p.podeConfirmar) {
    return {
      cor: 'secondary',
      texto: 'Nada a gravar: todas as linhas já estão iguais ao cadastro.',
    }
  }
  const h = p.horario
  const noHorario = h
    ? `; no horário, ${h.adicionar} atribuição(ões) nova(s) e ${h.atualizar} alterada(s)`
    : ''
  return {
    cor: 'success',
    texto: `Pronto para gravar: na oferta, ${soma('criar')} registro(s) novo(s) e ${soma('atualizar')} atualização(ões)${noHorario}. Tudo em uma única transação.`,
  }
})

async function validar() {
  ocupado.value = 'validar'
  erro.value = ''
  sucesso.value = ''
  previa.value = null
  try {
    previa.value = await http.enviar(
      `${base.value}/previa${sufixoDestino.value}`,
      'arquivos',
      listaArquivos.value
    )
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    ocupado.value = ''
  }
}

async function confirmar() {
  ocupado.value = 'confirmar'
  erro.value = ''
  try {
    const r = await http.enviar(
      `${base.value}${sufixoDestino.value}`,
      'arquivos',
      listaArquivos.value
    )
    const criadas = r.arquivos.reduce((s, a) => s + a.resumo.criar, 0)
    const atualizadas = r.arquivos.reduce((s, a) => s + a.resumo.atualizar, 0)
    sucesso.value = `Importação gravada: ${criadas} registro(s) novo(s) e ${atualizadas} atualização(ões) na oferta.`
    if (r.horario) {
      sucesso.value += ` No horário ${r.horario.nome}: ${r.horario.adicionar} atribuição(ões) adicionada(s) e ${r.horario.atualizar} atualizada(s).`
    }
    selecionados.value = null
    previa.value = null
    await carregarHistorico()
  } catch (e) {
    // 409/400 trazem a prévia refeita no servidor: mostra o que mudou desde a validação.
    if (e.detalhes?.arquivos) previa.value = e.detalhes
    erro.value = mensagemDeErro(e)
  } finally {
    ocupado.value = ''
  }
}

// ---------- Histórico ----------
const historico = ref([])
const carregandoHistorico = ref(false)
const camposHistorico = [
  { key: 'criadoEm', label: 'Data' },
  { key: 'tipo', label: 'Planilha' },
  { key: 'arquivo', label: 'Arquivo' },
  { key: 'usuario', label: 'Usuário' },
  { key: 'criadas', label: 'Novas' },
  { key: 'atualizadas', label: 'Atualizadas' },
  { key: 'acoes', label: '' },
]

async function carregarHistorico() {
  if (!periodo.value) return
  carregandoHistorico.value = true
  try {
    historico.value = await http.get(base.value)
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregandoHistorico.value = false
  }
}

watch(
  () => periodo.value?.id,
  () => {
    previa.value = null
    selecionados.value = null
    historico.value = []
    if (!periodo.value) return
    carregarHorarios()
    carregarHistorico()
  },
  { immediate: true }
)

const relatorioVisivel = ref(false)
const relatorio = ref(null)
const relatorioTitulo = ref('')

async function abrirRelatorio(item) {
  relatorio.value = null
  relatorioTitulo.value = `${tituloDo(item.tipo)} · ${formatarData(item.criadoEm)}`
  relatorioVisivel.value = true
  try {
    const d = await http.get(`${base.value}/${item.id}`)
    relatorio.value = { arquivo: d.arquivo, titulo: tituloDo(d.tipo), ...d.relatorio }
  } catch (e) {
    relatorioVisivel.value = false
    erro.value = mensagemDeErro(e)
  }
}

function formatarData(valor) {
  return valor
    ? new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : ''
}
</script>

<style scoped>
.campo-arquivo {
  min-width: 240px;
}
</style>
