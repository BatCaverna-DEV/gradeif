// Período letivo ativo (seletor no layout). A escolha fica no localStorage
// apenas como conveniência; o servidor é a fonte dos dados.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { http } from '@/api/http'

const CHAVE = 'horarios.periodoAtivo'

function lerSalvo() {
  try {
    return Number(localStorage.getItem(CHAVE)) || null
  } catch {
    return null
  }
}

export const usePeriodoStore = defineStore('periodo', () => {
  const periodos = ref([])
  const ativoId = ref(lerSalvo())
  const carregando = ref(false)

  const ativo = computed(() => periodos.value.find((p) => p.id === ativoId.value) ?? null)

  watch(ativoId, (id) => {
    try {
      if (id) localStorage.setItem(CHAVE, String(id))
      else localStorage.removeItem(CHAVE)
    } catch {
      /* armazenamento indisponível: ignora */
    }
  })

  async function carregar() {
    carregando.value = true
    try {
      periodos.value = await http.get('/periodos')
      if (!ativo.value) ativoId.value = periodos.value[0]?.id ?? null
    } finally {
      carregando.value = false
    }
  }

  function selecionar(id) {
    ativoId.value = id
  }

  return { periodos, ativoId, ativo, carregando, carregar, selecionar }
})
