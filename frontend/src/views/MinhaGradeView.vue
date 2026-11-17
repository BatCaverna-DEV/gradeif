<!-- F5-08 — "Minha grade": abre a consulta pública já filtrada no professor da conta. -->
<template>
  <div>
    <h1 class="h3">Minha grade</h1>
    <div v-if="carregando" class="text-center py-5"><BSpinner label="Carregando" /></div>
    <BAlert v-else-if="!auth.usuario?.professorId" :model-value="true" variant="warning">
      Sua conta não está vinculada a um professor. Peça ao gestor para fazer o vínculo.
    </BAlert>
    <BAlert v-else-if="mensagem" :model-value="true" variant="info">{{ mensagem }}</BAlert>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { BAlert, BSpinner } from 'bootstrap-vue-next'
import { http, mensagemDeErro } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { usePeriodoStore } from '@/stores/periodo'

const auth = useAuthStore()
const periodoStore = usePeriodoStore()
const router = useRouter()
const carregando = ref(false)
const mensagem = ref('')

watch(
  () => periodoStore.ativo,
  async (periodo) => {
    const professorId = auth.usuario?.professorId
    if (!periodo || !professorId) return
    carregando.value = true
    try {
      const publicados = await http.get('/publico/periodos')
      if (publicados.some((p) => p.id === periodo.id)) {
        router.replace({
          name: 'consulta',
          params: { periodoId: periodo.id, tipo: 'professor', recursoId: professorId },
        })
      } else {
        mensagem.value = `A grade do período ${periodo.nome} ainda não foi publicada.`
      }
    } catch (e) {
      mensagem.value = mensagemDeErro(e)
    } finally {
      carregando.value = false
    }
  },
  { immediate: true }
)
</script>
