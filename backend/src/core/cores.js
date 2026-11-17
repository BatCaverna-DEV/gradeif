// Cor de cada professor nas grades. Sem cor escolhida no cadastro, a cor é
// automática: o matiz avança pelo ângulo de ouro (≈137,5°) a cada id, então ids
// próximos ficam com cores bem diferentes e a mesma pessoa tem sempre a mesma cor.

export const FORMATO_COR = /^#[0-9a-f]{6}$/i

const ANGULO_DE_OURO = 137.508

function hslParaHex(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const canal = (n) => {
    const k = (n + h / 30) % 12
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${canal(0)}${canal(8)}${canal(4)}`
}

// Ids que caem em matizes parecidos (distância 13, 21, 34... pela sequência de
// Fibonacci) ganham luminosidade ou saturação diferentes: três níveis de luz pelo
// resto da divisão por 3 e dois de saturação pela paridade.
const LUZ = [0.36, 0.47, 0.58]
const SATURACAO = [0.78, 0.55]

export function corAutomatica(id) {
  const n = Number(id)
  const matiz = (n * ANGULO_DE_OURO) % 360
  return hslParaHex(matiz, SATURACAO[n % 2], LUZ[n % 3])
}

export function corDoProfessor(id, cor) {
  return cor && FORMATO_COR.test(cor) ? cor.toLowerCase() : corAutomatica(id)
}
