// Mesma normalização usada no backend: sem acento, minúsculo, pontuação vira espaço.
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .trim()
}
