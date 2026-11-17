<template>
  <div class="nao-encontrado">
    <img :src="icone" alt="" class="icone" />
    <p class="codigo">404</p>
    <h1 class="h3">Página não encontrada</h1>
    <p class="text-body-secondary">O endereço acessado não existe ou foi movido.</p>
    <RouterLink to="/" class="btn btn-primary mt-2">
      <i class="bi bi-house-door me-1" aria-hidden="true" />Voltar ao início
    </RouterLink>
  </div>
</template>

<script setup>
import icone from '@/assets/icone-gradeif.png'
</script>

<style scoped>
.nao-encontrado {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem 1rem;
}
.icone {
  width: 96px;
  height: 96px;
  margin-bottom: 0.5rem;
}
.codigo {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--gf-verde-vivo);
  margin-bottom: 0.25rem;
}
</style>
