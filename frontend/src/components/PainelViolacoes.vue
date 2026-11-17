<!--
  F3-09 — Lista de violações de uma versão. Clicar numa violação emite "selecionar";
  a tela da versão muda a visão para o recurso envolvido e destaca as aulas.
-->
<template>
  <div>
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <BButtonGroup size="sm" aria-label="Filtrar por tipo">
        <BButton
          v-for="f in FILTROS"
          :key="f.valor"
          :variant="filtro === f.valor ? 'primary' : 'outline-primary'"
          :pressed="filtro === f.valor"
          @click="filtro = f.valor"
        >
          {{ f.rotulo }} ({{ contagem[f.valor] }})
        </BButton>
      </BButtonGroup>
      <BFormCheckbox v-model="soDaVisao" switch class="small">Só da grade aberta</BFormCheckbox>
    </div>

    <p v-if="!visiveis.length" class="small text-body-secondary mb-0">
      {{ violacoes.length ? 'Nenhuma violação com este filtro.' : 'Nenhuma violação.' }}
    </p>

    <ul v-else class="list-unstyled lista mb-0">
      <li v-for="item in visiveis" :key="item.indice">
        <button
          type="button"
          class="violacao"
          :class="{ ativa: item.indice === selecionada, rigida: item.rigida }"
          @click="emit('selecionar', item.v, item.indice)"
        >
          <span class="badge me-1" :class="item.rigida ? 'text-bg-danger' : 'text-bg-warning'">{{
            item.v.codigo
          }}</span>
          <span class="small">{{ item.v.mensagem }}</span>
          <span v-if="!item.rigida" class="small text-body-secondary">
            · {{ item.v.custo }} × peso {{ pesos[item.v.codigo] ?? '?' }}</span
          >
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { BButton, BButtonGroup, BFormCheckbox } from 'bootstrap-vue-next'

const props = defineProps({
  violacoes: { type: Array, required: true },
  // Decide se uma violação pertence à grade aberta (turma, professor ou sala).
  pertenceAVisao: { type: Function, default: () => true },
  pesos: { type: Object, default: () => ({}) },
  selecionada: { type: Number, default: -1 },
})
const emit = defineEmits(['selecionar'])

const FILTROS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'rigidas', rotulo: 'Rígidas' },
  { valor: 'flexiveis', rotulo: 'Flexíveis' },
]
const filtro = ref('todas')
const soDaVisao = ref(false)

// Rígidas primeiro, mantendo a ordem do avaliador.
const itens = computed(() =>
  props.violacoes
    .map((v, indice) => ({ v, indice, rigida: v.codigo.startsWith('R') }))
    .sort((a, b) => Number(b.rigida) - Number(a.rigida) || a.indice - b.indice)
)

const daVisao = computed(() =>
  soDaVisao.value ? itens.value.filter((i) => props.pertenceAVisao(i.v)) : itens.value
)

const contagem = computed(() => ({
  todas: daVisao.value.length,
  rigidas: daVisao.value.filter((i) => i.rigida).length,
  flexiveis: daVisao.value.filter((i) => !i.rigida).length,
}))

const visiveis = computed(() =>
  daVisao.value.filter((i) => filtro.value === 'todas' || (filtro.value === 'rigidas') === i.rigida)
)
</script>

<style scoped>
.lista {
  max-height: 70vh;
  overflow-y: auto;
}
.violacao {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--bs-border-color);
  background: transparent;
  color: var(--bs-body-color);
  padding: 0.4rem 0.25rem;
}
.violacao:hover,
.violacao:focus-visible {
  background: var(--bs-tertiary-bg);
}
.violacao.ativa {
  background: var(--bs-primary-bg-subtle);
}
</style>
