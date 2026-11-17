// F1-13 — Store do usuário autenticado.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { http, definirAoNaoAutenticado } from '@/api/http'

export const useAuthStore = defineStore('auth', () => {
  const usuario = ref(null)
  const verificado = ref(false) // já consultou /auth/eu nesta carga da página

  const autenticado = computed(() => !!usuario.value)
  const ehGestor = computed(() => usuario.value?.perfil === 'gestor')

  definirAoNaoAutenticado(() => {
    usuario.value = null
  })

  async function carregar() {
    if (verificado.value) return usuario.value
    try {
      const { usuario: u } = await http.get('/auth/eu')
      usuario.value = u
    } catch {
      usuario.value = null
    } finally {
      verificado.value = true
    }
    return usuario.value
  }

  async function entrar(email, senha) {
    const { usuario: u } = await http.post('/auth/login', { email, senha })
    usuario.value = u
    verificado.value = true
    return u
  }

  async function sair() {
    try {
      await http.post('/auth/logout')
    } finally {
      usuario.value = null
    }
  }

  return { usuario, autenticado, ehGestor, carregar, entrar, sair }
})
