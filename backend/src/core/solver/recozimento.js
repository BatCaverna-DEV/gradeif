// F2-14 — Recozimento simulado.
//
// Aceita toda melhora e aceita piora com probabilidade exp(-variação / T). A
// temperatura cai de forma geométrica de T0 a Tf ao longo do tempo limite ou, se
// houver maxIteracoes, ao longo das iterações (o que torna o resultado
// reproduzível com a mesma semente). Devolve a grade na melhor solução vista.

import { PESO_RIGIDA } from '../avaliador.js'
import { sortearMovimento } from './movimentos.js'

const INTERVALO_PROGRESSO_MS = 500

// T0 tal que uma piora média (só flexível) seja aceita com probabilidade 1/2,
// limitada a PESO_RIGIDA / 20: a busca parte de uma grade construída e não deve
// aceitar violação rígida com frequência (exp(-20) ≈ 2e-9).
export const TEMPERATURA_MAXIMA = PESO_RIGIDA / 20

export function estimarTemperatura(estado, rnd, amostras = 200) {
  let soma = 0
  let n = 0
  for (let k = 0; k < amostras; k++) {
    const mov = sortearMovimento(estado, rnd)
    if (!mov) continue
    const v = estado.experimentar(mov).total
    estado.desfazer(mov)
    if (v > 0 && v < PESO_RIGIDA) {
      soma += v
      n++
    }
  }
  return n ? Math.min(soma / n / Math.LN2, TEMPERATURA_MAXIMA) : 10
}

export function recozer(estado, rnd, opcoes, { inicio, aoProgresso, deveParar } = {}) {
  // Sem bloco móvel (todas as aulas fixadas, ou nenhuma aula): não há o que mudar.
  if (!estado.ativos.length) return { iteracoes: 0, aceitos: 0, motivoFim: 'sem-blocos' }

  const t0Relogio = inicio ?? performance.now()
  const limite = opcoes.tempoLimiteMs
  const maxIt = opcoes.maxIteracoes ?? 0
  const T0 = opcoes.temperaturaInicial ?? estimarTemperatura(estado, rnd)
  const Tf = Math.min(opcoes.temperaturaFinal ?? 0.05, T0)
  const av = estado.av

  let melhor = av.custoTotal
  let melhorRigido = av.rigido
  let melhorFlexivel = av.flexivel
  let foto = estado.fotografar()
  let T = T0
  let it = 0
  let aceitos = 0
  let ultimoProgresso = 0
  let motivoFim = 'tempo'

  const informar = (agora) => {
    ultimoProgresso = agora
    aoProgresso?.({
      etapa: 'melhoria',
      iteracao: it,
      tempoMs: Math.round(agora - t0Relogio),
      temperatura: T,
      custoAtual: av.custoTotal,
      melhorCusto: melhor,
      melhorRigido,
      melhorFlexivel,
      fracao: maxIt ? Math.min(1, it / maxIt) : Math.min(1, (agora - t0Relogio) / limite),
      aceitos,
    })
  }

  for (;;) {
    if (maxIt && it >= maxIt) {
      motivoFim = 'iteracoes'
      break
    }
    if ((it & 255) === 0) {
      const agora = performance.now()
      const decorrido = agora - t0Relogio
      if (decorrido >= limite) break
      if (deveParar?.()) {
        motivoFim = 'cancelado'
        break
      }
      const fracao = maxIt ? it / maxIt : decorrido / limite
      T = T0 * Math.pow(Tf / T0, fracao)
      if (agora - ultimoProgresso >= INTERVALO_PROGRESSO_MS) informar(agora)
    }
    // Sem nada a melhorar, para cedo.
    if (melhor === 0) {
      motivoFim = 'otimo'
      break
    }
    it++
    const mov = sortearMovimento(estado, rnd)
    if (!mov) continue
    const v = estado.experimentar(mov).total
    if (v <= 0 || rnd.proximo() < Math.exp(-v / T)) {
      estado.aceitar()
      aceitos++
      if (av.custoTotal < melhor) {
        melhor = av.custoTotal
        melhorRigido = av.rigido
        melhorFlexivel = av.flexivel
        foto = estado.fotografar()
      }
    } else {
      estado.desfazer(mov)
    }
  }

  estado.restaurar(foto)
  informar(performance.now())
  return { iteracoes: it, aceitos, motivoFim, temperaturaInicial: T0 }
}
