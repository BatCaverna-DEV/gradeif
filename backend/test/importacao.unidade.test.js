// Importação sem banco: leitura de arquivos, cabeçalhos, detecção e validação.
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { decodificar, detectarSeparador, lerArquivo } from '../src/importacao/leitor.js'
import { TIPOS, detectarTipo, mapearColunas, validarLinha } from '../src/importacao/planilhas.js'
import { gerarModelo } from '../src/importacao/modelos.js'
import { normalizar, separarLista } from '../src/importacao/texto.js'

describe('leitura de CSV', () => {
  it('reconhece UTF-8 e Latin-1', () => {
    expect(decodificar(Buffer.from('Código;Nível', 'utf8'))).toMatchObject({
      texto: 'Código;Nível',
      codificacao: 'utf-8',
    })
    expect(decodificar(Buffer.from('Código;Nível', 'latin1'))).toMatchObject({
      texto: 'Código;Nível',
      codificacao: 'latin-1',
    })
  })

  it('detecta o separador ignorando o que está entre aspas', () => {
    expect(detectarSeparador('a;b;c\n1;2;3')).toBe(';')
    expect(detectarSeparador('a,b\n1,2')).toBe(',')
    expect(detectarSeparador('"x;y;z",w\n1,2')).toBe(',')
    expect(detectarSeparador('sozinha')).toBe(',')
  })

  it('remove BOM, pula linhas vazias e mantém o número da linha', async () => {
    const csv = '﻿Nome;Capacidade\nSala 1;40\n;\n\nSala "2";30\n'
    const leitura = await lerArquivo(Buffer.from(csv, 'utf8'), 'salas.csv')
    expect(leitura.cabecalhos).toEqual(['Nome', 'Capacidade'])
    expect(leitura.separador).toBe(';')
    expect(leitura.linhas).toEqual([
      { numero: 2, valores: ['Sala 1', '40'] },
      { numero: 5, valores: ['Sala "2"', '30'] },
    ])
  })

  it('aceita campos entre aspas com o separador dentro', async () => {
    const csv = 'Turma,Disciplina,Professores\nINF1M,MAT1,"111, 222"\n'
    const leitura = await lerArquivo(Buffer.from(csv), 'a.csv')
    expect(leitura.linhas[0].valores[2]).toBe('111, 222')
  })
})

describe('leitura de XLSX', () => {
  it('converte texto rico, fórmula e número em texto', async () => {
    const pasta = new ExcelJS.Workbook()
    const aba = pasta.addWorksheet('Dados')
    aba.addRow(['Nome', 'Capacidade'])
    aba.addRow([{ richText: [{ text: 'Lab ' }, { text: 'Química' }] }, 25])
    aba.addRow(['Sala 2', { formula: '20+10', result: 30 }])
    const buffer = Buffer.from(await pasta.xlsx.writeBuffer())

    const leitura = await lerArquivo(buffer, 'salas.xlsx')
    expect(leitura.formato).toBe('xlsx')
    expect(leitura.linhas).toEqual([
      { numero: 2, valores: ['Lab Química', '25'] },
      { numero: 3, valores: ['Sala 2', '30'] },
    ])
  })

  it('recusa .xls, extensões desconhecidas, arquivo vazio e XLSX corrompido', async () => {
    await expect(lerArquivo(Buffer.from('x'), 'a.xls')).rejects.toThrow(/\.xls antigo/)
    await expect(lerArquivo(Buffer.from('x'), 'a.pdf')).rejects.toThrow(/não suportada/)
    await expect(lerArquivo(Buffer.from('\n\n'), 'a.csv')).rejects.toThrow(/vazio/)
    await expect(lerArquivo(Buffer.from('não é zip'), 'a.xlsx')).rejects.toThrow(/inválido/)
  })
})

describe('cabeçalhos e tipo da planilha', () => {
  it('normaliza acentos, maiúsculas e pontuação', () => {
    expect(normalizar('  NÚMERO de Alunos ')).toBe('numero de alunos')
    expect(normalizar('E-mail')).toBe('e mail')
    expect(normalizar('Nº de alunos')).toBe('n de alunos')
  })

  it('separa listas por vírgula, ponto e vírgula, barra ou "e"', () => {
    expect(separarLista('Matutino, Vespertino')).toEqual(['Matutino', 'Vespertino'])
    expect(separarLista('M;V/N')).toEqual(['M', 'V', 'N'])
    expect(separarLista('Matutino e Noturno')).toEqual(['Matutino', 'Noturno'])
  })

  it.each([
    [['Nome', 'Tipo', 'Capacidade'], 'salas'],
    [['NOME', 'SIAPE', 'E-mail', 'Carga Máxima Semanal (aulas)'], 'professores'],
    [['sigla', 'nome', 'tipo de ambiente'], 'disciplinas'],
    [['Código', 'Curso', 'Nível', 'Turnos', 'Nº de alunos'], 'turmas'],
    [['Turma', 'Disciplina', 'Professores (SIAPE)', 'Aulas semanais', 'Bloco'], 'atribuicoes'],
  ])('detecta %j como %s', (cabecalhos, tipo) => {
    expect(detectarTipo(cabecalhos)).toBe(tipo)
  })

  it('não reconhece cabeçalhos sem as colunas obrigatórias', () => {
    expect(detectarTipo(['Nome', 'Telefone'])).toBeNull()
  })

  it('aponta colunas ignoradas e repetidas', () => {
    const mapa = mapearColunas('salas', ['Nome', 'Sala', 'Capacidade', 'Andar'])
    expect(mapa.repetidas).toEqual(['Sala'])
    expect(mapa.ignoradas).toEqual(['Andar'])
  })

  it.each(TIPOS)('o modelo de %s é reconhecido sem colunas ignoradas', async (tipo) => {
    const leitura = await lerArquivo(await gerarModelo(tipo), `modelo-${tipo}.xlsx`)
    expect(detectarTipo(leitura.cabecalhos)).toBe(tipo)
    expect(mapearColunas(tipo, leitura.cabecalhos).ignoradas).toEqual([])
  })
})

describe('validação por linha', () => {
  const erros = (tipo, bruto) => validarLinha(tipo, bruto).erros

  it('recusa carga zerada e SIAPE com letras', () => {
    expect(erros('professores', { nome: 'Ana', siape: '12a4567', cargaMaxima: '0' })).toEqual([
      { coluna: 'SIAPE', mensagem: 'O SIAPE deve conter só dígitos (4 a 12)' },
      { coluna: 'Carga máxima semanal', mensagem: 'A carga máxima não pode ser zero' },
    ])
  })

  it('aceita carga vazia e e-mail em maiúsculas', () => {
    const { dados } = validarLinha('professores', {
      nome: 'Ana',
      siape: '1234567',
      email: 'ANA@IFMA.EDU.BR',
    })
    expect(dados).toEqual({ nome: 'Ana', siape: '1234567', email: 'ana@ifma.edu.br' })
  })

  it('reconhece o nível escrito de formas diferentes', () => {
    const nivel = (n) =>
      validarLinha('turmas', { codigo: 'T', curso: 'C', nivel: n, turnos: 'M', numeroAlunos: '30' })
    expect(nivel('Ensino Médio Integrado').dados.nivel).toBe('integrado')
    expect(nivel('SUBSEQUENTE').dados.nivel).toBe('subsequente')
    expect(nivel('Licenciatura').dados.nivel).toBe('superior')
    expect(nivel('técnico').erros[0]).toEqual({
      coluna: 'Nível',
      mensagem: 'Nível inválido: use integrado, subsequente ou superior',
    })
  })

  it('exige números inteiros e campos obrigatórios', () => {
    expect(erros('salas', { nome: '', capacidade: '40,5' })).toEqual([
      { coluna: 'Nome', mensagem: 'Campo obrigatório' },
      { coluna: 'Capacidade', mensagem: 'Informe um número inteiro' },
    ])
  })

  it('recusa bloco maior que as aulas semanais', () => {
    expect(
      erros('atribuicoes', {
        turma: 'T',
        disciplina: 'D',
        professores: '1',
        aulasSemanais: '2',
        tamanhoBloco: '3',
      })
    ).toEqual([
      { coluna: 'Tamanho do bloco', mensagem: 'O bloco não pode ser maior que as aulas semanais' },
    ])
  })
})
