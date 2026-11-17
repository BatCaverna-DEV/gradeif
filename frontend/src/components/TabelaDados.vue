<template>
  <div>
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <BFormInput
        v-model="busca"
        type="search"
        :placeholder="placeholder"
        class="campo-busca"
        :aria-label="placeholder"
      />
      <span class="small text-body-secondary ms-auto">
        {{
          filtrados.length === itens.length
            ? `${itens.length} registro(s)`
            : `${filtrados.length} de ${itens.length}`
        }}
      </span>
    </div>

    <BTable
      :items="filtrados"
      :fields="camposComAcoes"
      :busy="carregando"
      :per-page="porPagina"
      :current-page="pagina"
      show-empty
      :empty-text="busca ? 'Nada encontrado para esta busca.' : textoVazio"
      small
      hover
      responsive
      class="mb-2"
    >
      <template #table-busy>
        <div class="text-center py-3"><BSpinner small /></div>
      </template>

      <!-- Repassa as células personalizadas de quem usa a tabela. -->
      <template v-for="(_, nome) in slotsDeCelula" #[nome]="dados" :key="nome">
        <slot :name="nome" v-bind="dados" />
      </template>

      <template #cell(acoes)="{ item }">
        <div class="d-flex gap-1 justify-content-end">
          <BButton size="sm" variant="outline-secondary" @click="emit('editar', item)"
            >Corrigir</BButton
          >
          <BButton size="sm" variant="outline-danger" @click="emit('excluir', item)"
            >Excluir</BButton
          >
        </div>
      </template>
    </BTable>

    <div v-if="filtrados.length > porPagina" class="d-flex justify-content-center">
      <BPagination
        v-model="pagina"
        :total-rows="filtrados.length"
        :per-page="porPagina"
        size="sm"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, useSlots, watch } from 'vue'
import { BButton, BFormInput, BPagination, BSpinner, BTable } from 'bootstrap-vue-next'
import { normalizar } from '@/utils/texto'

// Tabela de consulta reutilizada pelos cinco cadastros (F1-21): busca sem
// diferenciar acento e maiúscula, ordenação por coluna, paginação e ações.
const props = defineProps({
  itens: { type: Array, required: true },
  campos: { type: Array, required: true },
  // Campos usados na busca: nome da propriedade ou função (item) => texto.
  camposBusca: { type: Array, required: true },
  carregando: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Buscar...' },
  textoVazio: { type: String, default: 'Nenhum registro. Use a importação de planilhas.' },
  porPagina: { type: Number, default: 25 },
  // Sem as ações de corrigir e excluir (horário de outro editor, publicado...).
  somenteLeitura: { type: Boolean, default: false },
})

const emit = defineEmits(['editar', 'excluir'])
const slots = useSlots()

const busca = ref('')
const pagina = ref(1)
watch(busca, () => (pagina.value = 1))

const slotsDeCelula = computed(() =>
  Object.fromEntries(Object.entries(slots).filter(([nome]) => nome.startsWith('cell(')))
)

const camposComAcoes = computed(() =>
  props.somenteLeitura
    ? props.campos
    : [...props.campos, { key: 'acoes', label: '', thClass: 'text-end', tdClass: 'text-nowrap' }]
)

function textoDeBusca(item) {
  return normalizar(
    props.camposBusca.map((c) => (typeof c === 'function' ? c(item) : item[c])).join(' ')
  )
}

const filtrados = computed(() => {
  const termos = normalizar(busca.value).split(' ').filter(Boolean)
  if (!termos.length) return props.itens
  return props.itens.filter((item) => {
    const texto = textoDeBusca(item)
    return termos.every((t) => texto.includes(t))
  })
})
</script>

<style scoped>
.campo-busca {
  max-width: 320px;
}
</style>
