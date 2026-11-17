<template>
  <BForm novalidate @submit.prevent="emit('enviar')">
    <BFormGroup
      v-for="c in campos"
      :key="c.campo"
      :label="c.tipo === 'checkbox' ? undefined : c.rotulo"
      :label-for="`campo-${c.campo}`"
      :description="c.ajuda"
      :state="estado(c.campo)"
      :invalid-feedback="erros[c.campo]"
      class="mb-3"
    >
      <BFormCheckbox
        v-if="c.tipo === 'checkbox'"
        :id="`campo-${c.campo}`"
        v-model="modelo[c.campo]"
        :state="estado(c.campo)"
      >
        {{ c.rotulo }}
      </BFormCheckbox>

      <BFormSelect
        v-else-if="c.tipo === 'select'"
        :id="`campo-${c.campo}`"
        v-model="modelo[c.campo]"
        :options="opcoesDe(c)"
        :state="estado(c.campo)"
      />

      <BFormCheckboxGroup
        v-else-if="c.tipo === 'checkboxes'"
        :id="`campo-${c.campo}`"
        v-model="modelo[c.campo]"
        :options="opcoesDe(c)"
        :state="estado(c.campo)"
      />

      <template v-else-if="c.tipo === 'multiselect'">
        <BFormInput
          v-model="filtros[c.campo]"
          type="search"
          size="sm"
          class="mb-1"
          :placeholder="`Filtrar ${c.rotulo.toLowerCase()}...`"
          :aria-label="`Filtrar ${c.rotulo.toLowerCase()}`"
        />
        <BFormSelect
          :id="`campo-${c.campo}`"
          v-model="modelo[c.campo]"
          :options="opcoesFiltradas(c)"
          multiple
          :select-size="8"
          :state="estado(c.campo)"
        />
        <div class="small text-body-secondary mt-1">
          Selecionados: {{ selecionadosTexto(c) || 'nenhum' }}. Use Ctrl para marcar mais de um.
        </div>
      </template>

      <!-- Cor: vazia = automática (a do registro de origem, quando há). -->
      <div v-else-if="c.tipo === 'cor'" class="d-flex flex-wrap align-items-center gap-2">
        <template v-if="modelo[c.campo]">
          <BFormInput
            :id="`campo-${c.campo}`"
            v-model="modelo[c.campo]"
            type="color"
            class="campo-cor"
            :state="estado(c.campo)"
          />
          <code class="small">{{ modelo[c.campo] }}</code>
          <BButton size="sm" variant="link" @click="modelo[c.campo] = ''">Usar automática</BButton>
        </template>
        <template v-else>
          <span
            v-if="referencia?.[c.campo]"
            class="amostra-cor"
            :style="{ background: referencia[c.campo] }"
            aria-hidden="true"
          />
          <span class="small">Automática</span>
          <BButton
            :id="`campo-${c.campo}`"
            size="sm"
            variant="outline-secondary"
            @click="modelo[c.campo] = referencia?.[c.campo] ?? '#2f6fd0'"
            >Escolher cor</BButton
          >
        </template>
      </div>

      <BFormInput
        v-else
        :id="`campo-${c.campo}`"
        v-model="modelo[c.campo]"
        :type="c.tipo === 'numero' ? 'number' : c.tipo === 'email' ? 'email' : 'text'"
        :min="c.min"
        :max="c.max"
        :maxlength="c.tamanho"
        :state="estado(c.campo)"
      />
    </BFormGroup>
    <!-- Enter em qualquer campo envia o formulário. -->
    <button type="submit" class="d-none" aria-hidden="true" tabindex="-1" />
  </BForm>
</template>

<script setup>
import { reactive } from 'vue'
import {
  BButton,
  BForm,
  BFormCheckbox,
  BFormCheckboxGroup,
  BFormGroup,
  BFormInput,
  BFormSelect,
} from 'bootstrap-vue-next'
import { normalizar } from '@/utils/texto'

// Formulário genérico guiado pela definição de campos do cadastro
// (tipos: texto, email, numero, checkbox, select, checkboxes, multiselect, cor).
const props = defineProps({
  campos: { type: Array, required: true },
  // Registro em edição, como veio da API (null no cadastro novo).
  referencia: { type: Object, default: null },
  // Opções dos campos de escolha: { nomeDoCampo: [{ value, text }] }.
  opcoes: { type: Object, default: () => ({}) },
  // Mensagens de erro por campo, vindas da API.
  erros: { type: Object, default: () => ({}) },
})

const modelo = defineModel({ type: Object, required: true })
const emit = defineEmits(['enviar'])

const filtros = reactive({})

const estado = (campo) => (props.erros[campo] ? false : null)
const opcoesDe = (c) => c.opcoes ?? props.opcoes[c.campo] ?? []

// O filtro esconde opções, mas nunca as já selecionadas.
function opcoesFiltradas(c) {
  const termo = normalizar(filtros[c.campo])
  const selecionados = new Set(modelo.value[c.campo] ?? [])
  return opcoesDe(c).filter(
    (o) => !termo || selecionados.has(o.value) || normalizar(o.text).includes(termo)
  )
}

function selecionadosTexto(c) {
  const selecionados = new Set(modelo.value[c.campo] ?? [])
  return opcoesDe(c)
    .filter((o) => selecionados.has(o.value))
    .map((o) => o.text)
    .join(', ')
}
</script>

<style scoped>
.campo-cor {
  width: 3.5rem;
  padding: 0.2rem;
}
.amostra-cor {
  display: inline-block;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.25rem;
  border: 1px solid var(--bs-border-color);
}
</style>
