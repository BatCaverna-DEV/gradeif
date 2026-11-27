<!-- Legenda das marcas de disponibilidade do professor na grade (situacaoProfessor). -->
<template>
  <span class="legenda small text-nowrap" aria-hidden="true">
    <span class="amostra"></span> livre <span class="amostra evitar"></span> prefere evitar
    <span class="amostra indisponivel"></span> indisponível
  </span>
</template>

<style scoped>
/* Amostras como as células da grade: livre sem marca, os outros riscados. */
.amostra {
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  vertical-align: -0.15rem;
  margin-left: 0.5rem;
  border: 1px solid var(--bs-border-color);
}
.amostra.evitar {
  background-image: repeating-linear-gradient(
    135deg,
    transparent 0 3px,
    rgba(var(--bs-warning-rgb), 0.6) 3px 5px
  );
}
.amostra.indisponivel {
  background-image: repeating-linear-gradient(
    135deg,
    transparent 0 3px,
    rgba(var(--bs-danger-rgb), 0.35) 3px 5px
  );
}
</style>
