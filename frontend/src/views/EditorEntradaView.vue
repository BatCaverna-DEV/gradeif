<!-- Item "Editor de grade" do menu: abre a versão mais recente que pode ser editada. -->
<template>
  <div>
    <h1 class="h3">Editor de grade</h1>
    <BAlert v-if="!periodoStore.ativo" :model-value="true" variant="warning">
      Selecione um período letivo.
    </BAlert>
    <BAlert :model-value="!!erro" variant="danger">{{ erro }}</BAlert>
    <div v-if="carregando" class="text-center py-5"><BSpinner label="Carregando" /></div>
    <p v-else-if="periodoStore.ativo && !erro" class="text-body-secondary">
      Nenhuma versão editável neste período.
      <RouterLink :to="{ name: 'geracao' }">Gere uma grade</RouterLink> ou duplique a versão
      publicada na tela de <RouterLink :to="{ name: 'versoes' }">versões</RouterLink>.
    </p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { BAlert, BSpinner } from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { usePeriodoStore } from '@/stores/periodo'

const periodoStore = usePeriodoStore()
const router = useRouter()
const carregando = ref(false)
const erro = ref('')

watch(
  () => periodoStore.ativoId,
  async (id) => {
    if (!id) return
    carregando.value = true
    erro.value = ''
    try {
      const versoes = await http.get(`/periodos/${id}/versoes`)
      const editavel = versoes.find((v) => !v.publicada)
      if (editavel) router.replace({ name: 'editor-versao', params: { id: editavel.id } })
    } catch (e) {
      erro.value = mensagemDeErro(e)
    } finally {
      carregando.value = false
    }
  },
  { immediate: true }
)
</script>
