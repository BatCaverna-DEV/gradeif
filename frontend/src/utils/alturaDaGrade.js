// Altura disponível para a grade: do topo dela até o fim da janela, para que caiba
// na tela com rolagem própria (cabeçalho dos dias e coluna dos tempos ficam fixos).
// "elemento" envolve a grade; o que vier dentro dele depois da área de rolagem
// é descontado. Mede de novo ao redimensionar a
// janela, quando o elemento muda de tamanho e quando algo acima da grade muda.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const MINIMO = 320 // abaixo disso, a página rola normalmente
const FOLGA = 4 // bordas do cartão

export function useAlturaDaGrade(elemento, dependencias) {
  const altura = ref(null)

  function medir() {
    const el = elemento.value
    if (!el) return
    const caixa = el.getBoundingClientRect()
    const rolagem = el.querySelector('.rolagem-grade, .rolagem')
    const abaixo = rolagem ? caixa.bottom - rolagem.getBoundingClientRect().bottom : 0
    const topo = caixa.top + window.scrollY
    // Margem de baixo da área de conteúdo (main), para a página não rolar.
    const principal = el.closest('main')
    const margem = principal ? parseFloat(getComputedStyle(principal).paddingBottom) || 0 : 0
    const livre = window.innerHeight - topo - abaixo - margem - FOLGA
    const valor = `${Math.max(MINIMO, Math.floor(livre))}px`
    if (valor !== altura.value) altura.value = valor
  }
  const medirDepois = () => nextTick(medir)

  // Mudou o tamanho da área (troca de turma, legenda maior...): mede de novo.
  const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medirDepois) : null

  onMounted(() => {
    window.addEventListener('resize', medir)
    medirDepois()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', medir)
    observador?.disconnect()
  })
  watch(dependencias, medirDepois)
  // O elemento só existe depois de carregar.
  watch(elemento, (novo, antigo) => {
    if (antigo) observador?.unobserve(antigo)
    if (novo) observador?.observe(novo)
    medirDepois()
  })

  return altura
}
