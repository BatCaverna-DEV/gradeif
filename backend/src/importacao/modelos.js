// F0-05 — Planilhas-modelo de importação, geradas a partir das definições em
// planilhas.js. A aba "Dados" vem primeiro (é a lida na importação), com
// validação de célula; a aba "Instruções" explica cada coluna.
import ExcelJS from 'exceljs'
import { PLANILHAS } from './planilhas.js'

const VERDE = 'FF2F7D32'
const LINHAS_VALIDADAS = 1000

export const NOMES_ARQUIVO = {
  salas: 'salas.xlsx',
  professores: 'professores.xlsx',
  disciplinas: 'disciplinas.xlsx',
  turmas: 'turmas.xlsx',
  atribuicoes: 'atribuicoes.xlsx',
  oferta: 'oferta.xlsx',
}

function validacaoDaColuna(coluna) {
  const v = coluna.validacao
  if (!v) return null
  if (v.tipo === 'lista') {
    return {
      type: 'list',
      allowBlank: !coluna.obrigatoria,
      formulae: [`"${v.valores.join(',')}"`],
      showErrorMessage: true,
      errorTitle: coluna.rotulo,
      error: `Use um destes valores: ${v.valores.join(', ')}`,
    }
  }
  const max = v.max ?? 100000
  return {
    type: 'whole',
    operator: 'between',
    allowBlank: !coluna.obrigatoria,
    formulae: [v.min, max],
    showErrorMessage: true,
    errorTitle: coluna.rotulo,
    error: `Informe um número inteiro entre ${v.min} e ${max}`,
  }
}

export async function gerarModelo(tipo) {
  const def = PLANILHAS[tipo]
  const pasta = new ExcelJS.Workbook()
  pasta.creator = 'Sistema de Horários — IFMA Coelho Neto'
  pasta.created = new Date()

  const dados = pasta.addWorksheet('Dados', { views: [{ state: 'frozen', ySplit: 1 }] })
  dados.columns = def.colunas.map((c) => ({
    header: c.rotulo,
    key: c.campo,
    width: Math.max(14, c.rotulo.length + 4, String(c.exemplo ?? '').length + 4),
  }))

  const cabecalho = dados.getRow(1)
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
  cabecalho.alignment = { vertical: 'middle' }
  cabecalho.height = 20

  def.colunas.forEach((coluna, i) => {
    const celula = cabecalho.getCell(i + 1)
    celula.note = `${coluna.descricao}${coluna.obrigatoria ? ' (obrigatória)' : ' (opcional)'}`
    const validacao = validacaoDaColuna(coluna)
    if (validacao) {
      for (let linha = 2; linha <= LINHAS_VALIDADAS; linha++) {
        dados.getCell(linha, i + 1).dataValidation = validacao
      }
    }
    // Códigos e SIAPE como texto, para o Excel não comer zeros nem virar notação científica.
    if (['siape', 'codigo', 'sigla', 'turma', 'disciplina', 'professores'].includes(coluna.campo)) {
      dados.getColumn(i + 1).numFmt = '@'
    }
  })

  const instrucoes = pasta.addWorksheet('Instruções')
  instrucoes.columns = [
    { header: 'Coluna', key: 'coluna', width: 26 },
    { header: 'Obrigatória', key: 'obrigatoria', width: 12 },
    { header: 'Exemplo', key: 'exemplo', width: 28 },
    { header: 'Descrição', key: 'descricao', width: 90 },
  ]
  instrucoes.getRow(1).font = { bold: true }
  for (const c of def.colunas) {
    instrucoes.addRow({
      coluna: c.rotulo,
      obrigatoria: c.obrigatoria ? 'sim' : 'não',
      exemplo: c.exemplo ?? '',
      descricao: c.descricao,
    })
  }
  instrucoes.addRow({})
  const notas = [
    `Preencha a aba "Dados" a partir da linha 2, uma linha por registro. A chave de identificação é: ${def.chave}.`,
    'Carregar a planilha de novo atualiza os registros existentes pela chave, sem duplicar.',
    'Os cabeçalhos podem estar com ou sem acento e em maiúsculas ou minúsculas. Colunas extras são ignoradas.',
    'Também é aceito CSV (separado por vírgula ou ponto e vírgula, em UTF-8 ou Latin-1) com os mesmos cabeçalhos.',
  ]
  for (const nota of notas) instrucoes.addRow({ coluna: nota })

  return Buffer.from(await pasta.xlsx.writeBuffer())
}
