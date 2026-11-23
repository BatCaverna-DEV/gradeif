// Preferências de tela de quem usa o sistema, guardadas no navegador.
// Valem para todas as telas e voltam ao abrir o sistema de novo.
import { ref, watch } from 'vue'

function ler(chave, padrao) {
  try {
    const v = localStorage.getItem(chave)
    return v == null ? padrao : JSON.parse(v)
  } catch {
    return padrao
  }
}

function preferencia(chave, padrao) {
  const valor = ref(ler(chave, padrao))
  watch(valor, (v) => {
    try {
      localStorage.setItem(chave, JSON.stringify(v))
    } catch {
      // Sem acesso ao armazenamento (janela anônima etc.): vale só nesta aba.
    }
  })
  return valor
}

// Abaixo de Full HD, os cartões da grade começam compactos.
const telaPequena = () =>
  typeof window !== 'undefined' && (window.innerWidth < 1600 || window.innerHeight < 900)

// Modo foco: menu lateral recolhido só com os ícones, para a grade ganhar espaço.
export const menuRecolhido = preferencia('gradeif:menu-recolhido', false)

// Painel da direita do editor e da tela do horário (não alocadas, violações...).
export const painelRecolhido = preferencia('gradeif:painel-recolhido', false)

// Cartões da grade: compactos (sigla e professor abreviado) ou detalhados.
export const gradeCompacta = preferencia('gradeif:grade-compacta', telaPequena())

// Atalho "F" do modo foco nas telas da grade (fora de campos de texto).
export function atalhoDoFoco(evento) {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return false
  if (evento.target.closest?.('input, textarea, select, [contenteditable]')) return false
  if (evento.key !== 'f' && evento.key !== 'F') return false
  menuRecolhido.value = !menuRecolhido.value
  return true
}
