// F1-15 — Leitura de arquivos CSV e XLSX.
// Devolve sempre o mesmo formato: cabeçalhos originais e linhas de texto, com o
// número da linha na planilha para que os erros apontem o lugar certo.
import ExcelJS from 'exceljs'
import { parse } from 'csv-parse/sync'
import { ErroValidacao } from '../erros.js'

export const LIMITE_LINHAS = 5000

export function decodificar(buffer) {
  let texto
  let codificacao
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    codificacao = 'utf-8'
  } catch {
    // Não é UTF-8 válido: planilhas salvas pelo Excel em português costumam vir em Windows-1252.
    texto = new TextDecoder('windows-1252').decode(buffer)
    codificacao = 'latin-1'
  }
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1)
  return { texto, codificacao }
}

// Conta separadores na primeira linha não vazia, ignorando o que está entre aspas.
export function detectarSeparador(texto) {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const contagem = { ';': 0, ',': 0, '\t': 0 }
  let entreAspas = false
  for (const c of primeira) {
    if (c === '"') entreAspas = !entreAspas
    else if (!entreAspas && c in contagem) contagem[c]++
  }
  const [melhor, quantidade] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]
  return quantidade > 0 ? melhor : ','
}

function lerCsv(buffer) {
  const { texto, codificacao } = decodificar(buffer)
  const separador = detectarSeparador(texto)
  let registros
  try {
    registros = parse(texto, {
      delimiter: separador,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
      trim: true,
      info: true,
    })
  } catch (erro) {
    throw new ErroValidacao(null, `CSV malformado: ${erro.message}`)
  }
  const linhas = registros.map(({ record, info }) => ({ numero: info.lines, valores: record }))
  return { formato: 'csv', codificacao, separador, linhas }
}

function textoDaCelula(valor) {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  if (typeof valor === 'object') {
    if (Array.isArray(valor.richText)) return valor.richText.map((p) => p.text).join('')
    if ('result' in valor) return textoDaCelula(valor.result) // fórmula
    if ('text' in valor) return textoDaCelula(valor.text) // hiperlink
    if ('error' in valor) return ''
    return ''
  }
  return String(valor).trim()
}

async function lerXlsx(buffer) {
  const pasta = new ExcelJS.Workbook()
  try {
    await pasta.xlsx.load(buffer)
  } catch {
    throw new ErroValidacao(null, 'Arquivo XLSX inválido ou corrompido')
  }
  // Primeira aba visível: nos modelos ela é a de dados; "Instruções" vem depois.
  const aba = pasta.worksheets.find((a) => a.state !== 'hidden' && a.state !== 'veryHidden')
  if (!aba) throw new ErroValidacao(null, 'A planilha não tem abas visíveis')

  const linhas = []
  aba.eachRow({ includeEmpty: false }, (linha, numero) => {
    const valores = []
    linha.eachCell({ includeEmpty: true }, (celula, coluna) => {
      valores[coluna - 1] = textoDaCelula(celula.value)
    })
    linhas.push({ numero, valores: Array.from(valores, (v) => v ?? '') })
  })
  return { formato: 'xlsx', linhas }
}

// Lê o arquivo e separa cabeçalho (primeira linha não vazia) das linhas de dados.
export async function lerArquivo(buffer, nomeArquivo) {
  const extensao = String(nomeArquivo).toLowerCase().split('.').pop()

  let leitura
  if (extensao === 'csv' || extensao === 'txt') leitura = lerCsv(buffer)
  else if (extensao === 'xlsx') leitura = await lerXlsx(buffer)
  else if (extensao === 'xls')
    throw new ErroValidacao(null, 'O formato .xls antigo não é aceito; salve como .xlsx ou .csv')
  else throw new ErroValidacao(null, `Extensão .${extensao} não suportada; envie .xlsx ou .csv`)

  const naoVazia = (l) => l.valores.some((v) => String(v ?? '').trim() !== '')
  const linhas = leitura.linhas.filter(naoVazia)
  if (!linhas.length) throw new ErroValidacao(null, 'O arquivo está vazio')

  const [cabecalho, ...dados] = linhas
  if (dados.length > LIMITE_LINHAS) {
    throw new ErroValidacao(
      null,
      `O arquivo tem ${dados.length} linhas; o limite é ${LIMITE_LINHAS}`
    )
  }

  return {
    ...leitura,
    cabecalhos: cabecalho.valores.map((v) => String(v ?? '').trim()),
    linhas: dados,
  }
}
