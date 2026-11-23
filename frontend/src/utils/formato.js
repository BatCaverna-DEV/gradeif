// Formatação comum às telas.

export const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
export const DIAS_CURTOS = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export function formatarData(iso) {
  if (!iso) return ''
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function formatarDataHora(valor) {
  if (!valor) return ''
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return ''
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatarDuracao(ms) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`
}

export const formatarNumero = (n) => (n == null ? '' : Number(n).toLocaleString('pt-BR'))

// Custo do solver = rígidas × 1000 + flexíveis (backend/src/core/avaliador.js).
export const PESO_RIGIDA = 1000

// Nome abreviado para os cartões compactos da grade: primeiro e último nome
// ("Monieli de Araújo Santana" → "Monieli Santana"). Com Júnior, Filho, Neto ou
// Sobrinho no fim, entra também o sobrenome anterior.
const SUFIXOS = new Set(['junior', 'júnior', 'jr', 'jr.', 'filho', 'neto', 'sobrinho'])
export function nomeCurto(nome) {
  const partes = String(nome ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (partes.length <= 2) return partes.join(' ')
  const ultimo = partes.at(-1)
  return SUFIXOS.has(ultimo.toLowerCase())
    ? `${partes[0]} ${partes.at(-2)} ${ultimo}`
    : `${partes[0]} ${ultimo}`
}
