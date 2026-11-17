<template>
  <BCard no-body class="mb-3">
    <BCardHeader class="d-flex flex-wrap align-items-center gap-2">
      <strong>{{ arquivo.titulo ?? 'Arquivo não reconhecido' }}</strong>
      <span class="text-body-secondary small text-break">{{ arquivo.arquivo }}</span>
      <span v-if="formato" class="text-body-secondary small">· {{ formato }}</span>
      <div class="ms-auto d-flex flex-wrap gap-1">
        <BBadge v-for="s in situacoesComLinhas" :key="s.valor" :variant="s.cor">
          {{ arquivo.resumo[s.valor] }} {{ s.rotulo.toLowerCase() }}
        </BBadge>
      </div>
    </BCardHeader>

    <BCardBody v-if="arquivo.erro">
      <BAlert :model-value="true" variant="danger" class="mb-0">{{ arquivo.erro }}</BAlert>
    </BCardBody>

    <template v-else>
      <BCardBody class="py-2 d-flex flex-wrap align-items-center gap-2 border-bottom">
        <BFormRadioGroup
          v-model="filtro"
          :options="opcoesFiltro"
          buttons
          button-variant="outline-secondary"
          size="sm"
          aria-label="Filtrar linhas por situação"
        />
        <span v-if="arquivo.colunasIgnoradas?.length" class="small text-body-secondary">
          Colunas ignoradas: {{ arquivo.colunasIgnoradas.join(', ') }}
        </span>
        <div v-if="arquivo.avisos?.length" class="w-100 small text-warning-emphasis">
          <div v-for="(aviso, i) in arquivo.avisos" :key="i">{{ aviso }}</div>
        </div>
      </BCardBody>

      <BTable
        :items="pagina"
        :fields="campos"
        small
        responsive
        show-empty
        empty-text="Nenhuma linha nesta situação."
        class="mb-0 tabela-relatorio"
      >
        <template #cell(situacao)="{ item }">
          <BBadge :variant="corDe(item.situacao)">{{ rotuloDe(item.situacao) }}</BBadge>
        </template>
        <template #cell(detalhes)="{ item }">
          <ul v-if="item.erros?.length" class="lista text-danger">
            <li v-for="(e, i) in item.erros" :key="`e${i}`">
              <strong v-if="e.coluna">{{ e.coluna }}:</strong> {{ e.mensagem }}
            </li>
          </ul>
          <ul v-if="item.mudancas?.length" class="lista">
            <li v-for="m in item.mudancas" :key="m.campo">
              <strong>{{ m.campo }}:</strong>
              <span class="text-body-secondary">{{ vazioSe(m.de) }}</span> → {{ vazioSe(m.para) }}
            </li>
          </ul>
          <ul v-if="item.avisos?.length" class="lista text-warning-emphasis">
            <li v-for="(a, i) in item.avisos" :key="`a${i}`">{{ a }}</li>
          </ul>
          <BBadge v-if="item.aulasParaRevisar" variant="warning" class="text-dark">
            {{ item.aulasParaRevisar }} aula(s) para revisar na grade
          </BBadge>
          <div v-if="mudaNoHorario(item)" class="small">
            <BBadge variant="info">{{
              item.horario.acao === 'adicionar' ? 'Entra no horário' : 'Muda no horário'
            }}</BBadge>
            <span v-for="m in item.horario.mudancas" :key="m.campo" class="ms-1">
              <strong>{{ m.campo }}:</strong>
              <span class="text-body-secondary">{{ vazioSe(m.de) }}</span> → {{ vazioSe(m.para) }}
            </span>
          </div>
        </template>
      </BTable>

      <div v-if="filtradas.length > POR_PAGINA" class="d-flex justify-content-center pt-3">
        <BPagination
          v-model="paginaAtual"
          :total-rows="filtradas.length"
          :per-page="POR_PAGINA"
          size="sm"
        />
      </div>
    </template>
  </BCard>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  BAlert,
  BBadge,
  BCard,
  BCardBody,
  BCardHeader,
  BFormRadioGroup,
  BPagination,
  BTable,
} from 'bootstrap-vue-next'

const props = defineProps({
  arquivo: { type: Object, required: true },
})

const POR_PAGINA = 50

const SITUACOES = [
  { valor: 'rejeitar', rotulo: 'Rejeitadas', cor: 'danger' },
  { valor: 'criar', rotulo: 'Novas', cor: 'success' },
  { valor: 'atualizar', rotulo: 'Atualizadas', cor: 'primary' },
  { valor: 'inalterada', rotulo: 'Sem alteração', cor: 'secondary' },
]

const campos = [
  { key: 'linha', label: 'Linha', thStyle: { width: '4.5rem' } },
  { key: 'situacao', label: 'Situação', thStyle: { width: '8rem' } },
  { key: 'chave', label: 'Registro' },
  { key: 'detalhes', label: 'Detalhes' },
]

const formato = computed(() => {
  const a = props.arquivo
  if (a.formato === 'xlsx') return 'XLSX'
  if (a.formato === 'csv') {
    const sep =
      { ';': 'ponto e vírgula', ',': 'vírgula', '\t': 'tabulação' }[a.separador] ?? a.separador
    return `CSV ${a.codificacao ?? ''}, separado por ${sep}`
  }
  return ''
})

const situacoesComLinhas = computed(() =>
  SITUACOES.filter((s) => props.arquivo.resumo?.[s.valor] > 0)
)

// Importação num horário: linhas que adicionam ou mudam atribuição dele.
const mudaNoHorario = (l) => l.horario && l.horario.acao !== 'igual'
const qtdNoHorario = computed(() => (props.arquivo.linhas ?? []).filter(mudaNoHorario).length)

const opcoesFiltro = computed(() => [
  { value: 'todas', text: `Todas (${props.arquivo.resumo?.total ?? 0})` },
  ...situacoesComLinhas.value.map((s) => ({
    value: s.valor,
    text: `${s.rotulo} (${props.arquivo.resumo[s.valor]})`,
  })),
  ...(qtdNoHorario.value
    ? [{ value: 'horario', text: `Mudam no horário (${qtdNoHorario.value})` }]
    : []),
])

// Abre nas rejeitadas quando houver, que é o que o usuário precisa corrigir.
const filtro = ref('todas')
const paginaAtual = ref(1)
watch(
  () => props.arquivo,
  (a) => {
    filtro.value = a.resumo?.rejeitar > 0 ? 'rejeitar' : 'todas'
    paginaAtual.value = 1
  },
  { immediate: true }
)
watch(filtro, () => (paginaAtual.value = 1))

const filtradas = computed(() => {
  const linhas = props.arquivo.linhas ?? []
  if (filtro.value === 'todas') return linhas
  if (filtro.value === 'horario') return linhas.filter(mudaNoHorario)
  return linhas.filter((l) => l.situacao === filtro.value)
})
const pagina = computed(() =>
  filtradas.value.slice((paginaAtual.value - 1) * POR_PAGINA, paginaAtual.value * POR_PAGINA)
)

const corDe = (s) => SITUACOES.find((x) => x.valor === s)?.cor ?? 'secondary'
const rotuloDe = (s) =>
  ({ rejeitar: 'Rejeitada', criar: 'Nova', atualizar: 'Atualizada', inalterada: 'Sem alteração' })[
    s
  ] ?? s
const vazioSe = (v) => (v === null || v === undefined || v === '' ? '(vazio)' : v)
</script>

<style scoped>
.lista {
  margin: 0;
  padding-left: 1rem;
  font-size: 0.875rem;
}

.tabela-relatorio :deep(td) {
  vertical-align: top;
}
</style>
