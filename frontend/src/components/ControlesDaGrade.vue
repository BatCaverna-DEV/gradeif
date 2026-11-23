<!--
  Botões que ajustam o espaço da grade no editor e na tela do horário:
  modo foco (recolhe o menu lateral, atalho F), painel da direita e cartões
  compactos. As escolhas ficam salvas no navegador (utils/preferencias).
-->
<template>
  <BButtonGroup size="sm" aria-label="Espaço da grade">
    <BButton
      class="d-none d-lg-inline-block"
      :variant="menuRecolhido ? 'secondary' : 'outline-secondary'"
      :pressed="menuRecolhido"
      :title="menuRecolhido ? 'Mostrar o menu completo (F)' : 'Modo foco: recolher o menu (F)'"
      aria-label="Modo foco"
      @click="alternar('menu')"
      ><i class="bi bi-arrows-fullscreen" aria-hidden="true"
    /></BButton>
    <BButton
      v-if="comPainel"
      :variant="painelRecolhido ? 'outline-secondary' : 'secondary'"
      :pressed="!painelRecolhido"
      :title="painelRecolhido ? 'Mostrar o painel da direita' : 'Recolher o painel da direita'"
      aria-label="Painel da direita"
      @click="alternar('painel')"
      ><i class="bi bi-layout-sidebar-reverse" aria-hidden="true"
    /></BButton>
    <BButton
      :variant="gradeCompacta ? 'secondary' : 'outline-secondary'"
      :pressed="gradeCompacta"
      :title="
        gradeCompacta
          ? 'Cartões compactos (sigla e professor abreviado). Clique para detalhar.'
          : 'Cartões detalhados. Clique para compactar.'
      "
      aria-label="Cartões compactos"
      @click="alternar('compacta')"
      ><i
        :class="gradeCompacta ? 'bi bi-arrows-expand' : 'bi bi-arrows-collapse'"
        aria-hidden="true"
    /></BButton>
  </BButtonGroup>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { BButton, BButtonGroup } from 'bootstrap-vue-next'
import { atalhoDoFoco, gradeCompacta, menuRecolhido, painelRecolhido } from '@/utils/preferencias'

defineProps({ comPainel: { type: Boolean, default: true } })

// Pelo nome: no template, a ref importada chega desembrulhada (só o valor).
const PREFERENCIAS = { menu: menuRecolhido, painel: painelRecolhido, compacta: gradeCompacta }
const alternar = (nome) => (PREFERENCIAS[nome].value = !PREFERENCIAS[nome].value)

// Atalho F (modo foco) enquanto a tela da grade estiver aberta.
const aoTeclar = (evento) => {
  if (atalhoDoFoco(evento)) evento.preventDefault()
}
onMounted(() => window.addEventListener('keydown', aoTeclar))
onBeforeUnmount(() => window.removeEventListener('keydown', aoTeclar))
</script>
