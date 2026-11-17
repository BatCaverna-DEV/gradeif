// Normalização de texto usada na importação.

const ACENTOS = /[̀-ͯ]/g

// Para cabeçalhos: sem acento, minúsculo, qualquer pontuação vira espaço.
// "Nº de alunos" -> "n de alunos"; "E-mail" -> "e mail".
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(ACENTOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Para chaves de identificação (código de turma, sigla, nome de sala): sem acento,
// minúsculo e com espaços simples, mas preservando pontuação. Segue a comparação
// do MariaDB com utf8mb4_unicode_ci, que ignora acento e maiúscula.
export function chave(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(ACENTOS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Tipo de ambiente de sala e de disciplina: gravado já normalizado para que a
// restrição R7 compare os dois lados sem ambiguidade ("Laboratório" = "laboratorio").
export function tipoAmbiente(texto) {
  const valor = chave(texto)
  return valor || 'sala'
}

// Lista escrita numa célula: "M, V", "1234567; 7654321", "Matutino e Noturno".
export function separarLista(texto) {
  return String(texto ?? '')
    .split(/[,;/|\n]|\s+e\s+/i)
    .map((parte) => parte.trim())
    .filter(Boolean)
}
