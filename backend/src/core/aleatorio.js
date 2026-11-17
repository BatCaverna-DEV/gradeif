// F2-10 — Gerador pseudoaleatório com semente.
// A mesma semente produz a mesma sequência em qualquer máquina, o que permite
// reproduzir uma geração (a semente fica gravada na versão da grade).
// Algoritmo: hash cyrb128 da semente em texto + gerador sfc32.

function cyrb128(texto) {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < texto.length; i++) {
    const k = texto.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

export function criarAleatorio(semente = '1') {
  let [a, b, c, d] = cyrb128(String(semente))

  // Número em [0, 1).
  function proximo() {
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }

  // Descarta os primeiros valores, que saem pouco misturados.
  for (let i = 0; i < 15; i++) proximo()

  return {
    proximo,
    // Inteiro em [0, n).
    inteiro: (n) => Math.floor(proximo() * n),
    escolher: (lista) => lista[Math.floor(proximo() * lista.length)],
    // Embaralha uma cópia (Fisher–Yates).
    embaralhar(lista) {
      const copia = [...lista]
      for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(proximo() * (i + 1))
        ;[copia[i], copia[j]] = [copia[j], copia[i]]
      }
      return copia
    },
  }
}
