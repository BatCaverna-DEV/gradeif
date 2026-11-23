// Importação pela planilha de oferta (um arquivo só por período).
import { readFileSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { db, encerrarBanco } from '../src/db/knex.js'
import { lerArquivos } from '../src/importacao/previa.js'
import {
  confirmar as confirmarDoServico,
  previa as previaDoServico,
} from '../src/servicos/importacoes.js'
import { criarVersao } from '../src/servicos/versoes.js'
import { confirmarImportacao } from '../src/importacao/gravacao.js'
import { inferirNivel, siglaDe } from '../src/importacao/oferta.js'
import { detectarTipo } from '../src/importacao/planilhas.js'
import { painelDoPeriodo } from '../src/servicos/painel.js'
import { criarPeriodo, limparBanco } from './ajuda/banco.js'
import { importarTudo } from './ajuda/planilhas.js'

const banco = inject('bancoDisponivel')
const OFERTA = readFileSync(new URL('./fixtures/oferta-2027.1.csv', import.meta.url))
const CABECALHO = '"Semestre";"Turma";"Curso";"Período";"Disciplina";"Aulas/semana";"Professor"'

const arquivos = (...lista) =>
  lerArquivos(lista.map(([nome, conteudo]) => ({ nome, buffer: Buffer.from(conteudo) })))
const previa = (periodoId, ...lista) =>
  previaDoServico(
    periodoId,
    lista.map(([nome, conteudo]) => ({ nome, buffer: Buffer.from(conteudo) }))
  )
const importar = async (periodoId, ...lista) =>
  confirmarImportacao({ periodoId, lidos: await arquivos(...lista), usuarioId: null })

describe('regras da oferta', () => {
  it('gera siglas pelas iniciais, com numerais romanos e sem palavras vazias', () => {
    expect(siglaDe('Fundamentos de Programação')).toBe('FP')
    expect(siglaDe('Desenvolvimento de Sistemas Web II')).toBe('DSWII')
    expect(siglaDe('Interação Humano-Computador')).toBe('IHC')
    expect(siglaDe('Modelagem e Programação Orientada a Objetos')).toBe('MPOO')
    expect(siglaDe('Tecnologia da Informação e Comunicação')).toBe('TIC')
    expect(siglaDe('Química')).toBe('QUIM')
  })

  it('deduz o nível pelo período do curso ou pelo nome', () => {
    expect(inferirNivel('Téc. Desenv. Sistemas', '1º ano')).toBe('integrado')
    expect(inferirNivel('ADS 2025', '3º período')).toBe('superior')
    expect(inferirNivel('Téc. Informática', '2º módulo')).toBe('subsequente')
    expect(inferirNivel('Técnico em Administração', 'Optativa')).toBe('integrado')
    expect(inferirNivel('Administração', '')).toBe('superior')
  })

  it('reconhece a planilha de oferta pelos cabeçalhos', () => {
    expect(
      detectarTipo([
        'Semestre',
        'Turma',
        'Curso',
        'Período',
        'Disciplina',
        'Aulas/semana',
        'Professor',
      ])
    ).toBe('oferta')
    expect(detectarTipo(['Turma', 'Curso', 'Disciplina', 'Aulas', 'Professor'])).toBe('oferta')
    expect(detectarTipo(['Turma', 'Disciplina', 'Professores', 'Aulas semanais'])).toBe(
      'atribuicoes'
    )
  })
})

describe.skipIf(!banco)('importação pela planilha de oferta', () => {
  let periodoId

  beforeEach(async () => {
    await limparBanco()
    ;({ periodoId } = await criarPeriodo('2027.1'))
  })

  afterAll(async () => {
    await encerrarBanco()
  })

  it('cria professores, disciplinas, turmas e atribuições a partir de um arquivo só', async () => {
    const p = await previa(periodoId, ['oferta-2027.1.csv', OFERTA])
    const [arquivo] = p.arquivos
    expect(arquivo.tipo).toBe('oferta')
    expect(arquivo.resumo).toMatchObject({ total: 22, criar: 22, rejeitar: 0 })
    expect(p.podeConfirmar).toBe(true)
    const avisos = arquivo.linhas.flatMap((l) => l.avisos)
    expect(avisos.filter((a) => a.startsWith('Professor(a)'))).toHaveLength(5)
    expect(avisos).toContain('Disciplina "Redes de Computadores" será cadastrada com a sigla RC')
    expect(avisos.filter((a) => a.includes('"Redes de Computadores"'))).toHaveLength(1)

    await importar(periodoId, ['oferta-2027.1.csv', OFERTA])

    const turmas = await db('turma as t')
      .join('curso as c', 'c.id', 't.curso_id')
      .select('t.*', 'c.nome as curso', 'c.nivel')
    expect(turmas.map((t) => t.codigo).sort()).toEqual([
      '1 TDS',
      '2 TDS',
      '3 TDS',
      'Mod 1',
      'Mod 3',
      'Mod Extra',
      'Outros Bach',
      'Outros Int',
      'Outros Int (Técnico em Administração)',
    ])
    const porCodigo = Object.fromEntries(turmas.map((t) => [t.codigo, t]))
    expect(porCodigo['1 TDS'].nivel).toBe('integrado')
    expect(porCodigo['Mod 3'].nivel).toBe('superior')
    expect(porCodigo['Outros Bach']).toMatchObject({ curso: 'Administração', nivel: 'superior' })
    // Sem coluna de turno: todos os turnos, pendente de definição.
    expect(JSON.parse(porCodigo['1 TDS'].turnos_permitidos)).toHaveLength(3)
    expect(porCodigo['1 TDS'].turnos_definidos).toBe(0)

    expect(await db('professor').whereNull('siape').count({ n: '*' }).first()).toEqual({ n: 5 })
    expect(await db('disciplina').count({ n: '*' }).first()).toEqual({ n: 20 })
    const blocos = await db('atribuicao as a')
      .join('disciplina as d', 'd.id', 'a.disciplina_id')
      .join('turma as t', 't.id', 'a.turma_id')
      .select('t.codigo', 'd.sigla', 'a.aulas_semanais', 'a.tamanho_bloco')
    expect(blocos).toHaveLength(22)
    expect(blocos.find((b) => b.sigla === 'PE')).toMatchObject({
      aulas_semanais: 5,
      tamanho_bloco: 2,
    })
    expect(blocos.find((b) => b.sigla === 'IB')).toMatchObject({ tamanho_bloco: 1 })

    const historico = await db('importacao')
    expect(historico.map((h) => [h.tipo, h.criadas])).toEqual([['oferta', 22]])

    const painel = await painelDoPeriodo(periodoId)
    expect(painel.pendencias[0].mensagem).toMatch(/^Defina o turno das turmas importadas/)
  })

  it('reimportar o mesmo arquivo não muda nada; alterar mostra o que muda', async () => {
    await importar(periodoId, ['oferta.csv', OFERTA])
    const igual = await previa(periodoId, ['oferta.csv', OFERTA])
    expect(igual.arquivos[0].resumo).toMatchObject({ inalterada: 22 })
    expect(igual.podeConfirmar).toBe(false)

    // Banco de Dados passa a ter 3 aulas e outro professor; a última linha sai do arquivo.
    const linhas = OFERTA.toString('utf8').trim().split(/\r?\n/)
    const alterado = linhas
      .slice(0, -1)
      .map((l) =>
        l.includes('"Banco de Dados"')
          ? l.replace('"2";"João Paulo Marques Silva"', '"3";"Bruno Vicente Alves de Lima"')
          : l
      )
      .join('\n')
    const p = await previa(periodoId, ['oferta.csv', alterado])
    const linha = p.arquivos[0].linhas.find((l) => l.chave.includes('Banco de Dados'))
    expect(linha.situacao).toBe('atualizar')
    expect(linha.mudancas.map((m) => [m.campo, m.de, m.para])).toEqual([
      ['Aulas semanais', 2, 3],
      ['Professores', 'João Paulo Marques Silva', 'Bruno Vicente Alves de Lima'],
    ])
    expect(p.arquivos[0].avisos[0]).toMatch(
      /^1 atribuição\(ões\) do período não aparecem no arquivo/
    )
  })

  it('importa num horário: gera as atribuições dele e mantém os ajustes de bloco', async () => {
    const versao = await criarVersao(periodoId, { nome: 'Versão A' })
    const arquivo = (conteudo) => [{ nome: 'oferta.csv', buffer: Buffer.from(conteudo) }]
    const doHorario = () =>
      db('atribuicao as a')
        .join('disciplina as d', 'd.id', 'a.disciplina_id')
        .where('a.versao_id', versao.id)
        .select('a.id', 'd.nome', 'a.aulas_semanais', 'a.tamanho_bloco')

    // Horário vazio: as 22 linhas entram na oferta e no horário.
    const p = await previaDoServico(periodoId, arquivo(OFERTA), { versaoId: versao.id })
    expect(p.horario).toMatchObject({ id: versao.id, adicionar: 22, atualizar: 0, iguais: 0 })
    expect(p.podeConfirmar).toBe(true)
    const r = await confirmarDoServico(periodoId, arquivo(OFERTA), null, { versaoId: versao.id })
    expect(r.horario).toMatchObject({ adicionar: 22 })
    expect(await doHorario()).toHaveLength(22)

    // Ajuste feito só no horário: Banco de Dados em blocos de 1.
    const bd = (await doHorario()).find((a) => a.nome === 'Banco de Dados')
    await db('atribuicao').where({ id: bd.id }).update({ tamanho_bloco: 1 })

    // Nova planilha: Banco de Dados com 3 aulas e outro professor (sem a coluna de bloco).
    const alterado = OFERTA.toString('utf8').replace(
      '"Banco de Dados";"2";"João Paulo Marques Silva"',
      '"Banco de Dados";"3";"Bruno Vicente Alves de Lima"'
    )
    const p2 = await previaDoServico(periodoId, arquivo(alterado), { versaoId: versao.id })
    expect(p2.horario).toMatchObject({ adicionar: 0, atualizar: 1, iguais: 21 })
    const linha = p2.arquivos[0].linhas.find((l) => l.chave.includes('Banco de Dados'))
    expect(linha.horario.mudancas.map((m) => m.campo)).toEqual(['Aulas semanais', 'Professores'])

    await confirmarDoServico(periodoId, arquivo(alterado), null, { versaoId: versao.id })
    const depois = await db('atribuicao').where({ id: bd.id }).first()
    expect(depois.aulas_semanais).toBe(3)
    expect(depois.tamanho_bloco).toBe(1)
    const profs = await db('atribuicao_professor as ap')
      .join('professor as p', 'p.id', 'ap.professor_id')
      .where('ap.atribuicao_id', bd.id)
      .pluck('p.nome')
    expect(profs).toEqual(['Bruno Vicente Alves de Lima'])

    // Mesmo arquivo de novo: nada a gravar, nem na oferta nem no horário.
    const igual = await previaDoServico(periodoId, arquivo(alterado), { versaoId: versao.id })
    expect(igual.horario).toMatchObject({ adicionar: 0, atualizar: 0, iguais: 22 })
    expect(igual.podeConfirmar).toBe(false)

    // Sem horário de destino, o horário não muda.
    const outra = await criarVersao(periodoId, { nome: 'Versão B' })
    const semDestino = await previaDoServico(periodoId, arquivo(OFERTA))
    expect(semDestino.horario).toBeNull()

    // Horário publicado não recebe importação.
    await db('versao_grade').where({ id: outra.id }).update({ publicada: true })
    await expect(
      previaDoServico(periodoId, arquivo(OFERTA), { versaoId: outra.id })
    ).rejects.toMatchObject({ status: 409 })
  })

  it('completa os professores da oferta pela planilha de professores', async () => {
    await importar(periodoId, ['oferta.csv', OFERTA])
    const antes = await db('professor').count('* as n').first()

    const planilha = [
      '"Nome";"SIAPE";"E-mail";"Carga máxima semanal"',
      // Da oferta, sem SIAPE: reconhecido pelo nome (sem acento e maiúscula).
      '"BRUNO VICENTE ALVES DE LIMA";"1226388";"bruno@ifma.edu.br";"16"',
      // Só o e-mail, sem SIAPE na planilha.
      '"Josenilson Dias Araujo";"";"josenilson@ifma.edu.br";""',
      // Professor novo.
      '"Maria Nova";"7654321";"";""',
    ].join('\n')
    const p = await previa(periodoId, ['professores.csv', planilha])
    const [arquivo] = p.arquivos
    expect(arquivo.tipo).toBe('professores')
    expect(arquivo.resumo).toMatchObject({ atualizar: 2, criar: 1, rejeitar: 0 })
    const bruno = arquivo.linhas.find((l) => l.chave.startsWith('BRUNO'))
    expect(bruno.mudancas.map((m) => m.campo)).toEqual(['SIAPE', 'Nome', 'E-mail', 'Carga máxima'])

    await importar(periodoId, ['professores.csv', planilha])
    const depois = await db('professor').count('* as n').first()
    expect(depois.n).toBe(antes.n + 1)
    const b = await db('professor').where({ siape: '1226388' }).first()
    expect(b).toMatchObject({ email: 'bruno@ifma.edu.br', carga_maxima_semanal: 16 })
    const j = await db('professor').where({ nome: 'Josenilson Dias Araujo' }).first()
    expect(j).toMatchObject({ siape: null, email: 'josenilson@ifma.edu.br' })
    // As atribuições continuam com o mesmo professor (nada duplicado).
    const vinculos = await db('atribuicao_professor').where({ professor_id: b.id }).count('* as n')
    expect(vinculos[0].n).toBeGreaterThan(0)

    // SIAPE errado no cadastro: a planilha corrige, com aviso.
    const correcao = await previa(periodoId, [
      'professores.csv',
      '"Nome";"SIAPE"\n"Bruno Vicente Alves de Lima";"9999999"',
    ])
    const [linhaCorrecao] = correcao.arquivos[0].linhas
    expect(linhaCorrecao.situacao).toBe('atualizar')
    expect(linhaCorrecao.avisos).toEqual(['SIAPE corrigido de 1226388 para 9999999'])

    // SIAPE de um professor com o nome de outro: recusado.
    const conflito = await previa(periodoId, [
      'professores.csv',
      '"Nome";"SIAPE"\n"Josenilson Dias Araujo";"1226388"',
    ])
    expect(conflito.arquivos[0].linhas[0].erros[0].mensagem).toMatch(/é de Bruno Vicente/i)
  })

  it('recusa linha de outro semestre e turno inexistente', async () => {
    const csv = [
      CABECALHO + ';"Turno"',
      '"2026.2";"1 TDS";"Téc. Desenv. Sistemas";"1º ano";"Banco de Dados";"2";"Ana";"M"',
      '"2027.1";"2 TDS";"Téc. Desenv. Sistemas";"2º ano";"Banco de Dados";"2";"Ana";"Integral"',
    ].join('\n')
    const p = await previa(periodoId, ['oferta.csv', csv])
    const [l1, l2] = p.arquivos[0].linhas
    expect(l1.erros[0]).toMatchObject({ coluna: 'Semestre' })
    expect(l2.erros[0].mensagem).toMatch(/Turno "Integral" não existe/)
    expect(p.podeConfirmar).toBe(false)
  })

  it('usa as colunas opcionais de turno, alunos e bloco', async () => {
    const csv = [
      'Turma;Curso;Período;Disciplina;Aulas/semana;Professor;Turno;Alunos;Tamanho do bloco',
      '1 TDS;Téc. Desenv. Sistemas;1º ano;Banco de Dados;3;Ana Lima / Bruno Melo;M;38;1',
    ].join('\n')
    await importar(periodoId, ['oferta.csv', csv])
    const turma = await db('turma').first()
    expect(turma).toMatchObject({ numero_alunos: 38, turnos_definidos: 1 })
    expect(JSON.parse(turma.turnos_permitidos)).toHaveLength(1)
    const atribuicao = await db('atribuicao').first()
    expect(atribuicao.tamanho_bloco).toBe(1)
    expect(await db('atribuicao_professor').count({ n: '*' }).first()).toEqual({ n: 2 })
  })

  it('turno novo da turma não marca aulas; turno retirado marca só as que estão nele', async () => {
    const linha = (turno) =>
      [
        'Turma;Curso;Período;Disciplina;Aulas/semana;Professor;Turno;Alunos',
        `1 TDS;Téc. Desenv. Sistemas;1º ano;Banco de Dados;3;Ana Lima;${turno};38`,
      ].join('\n')
    await importar(periodoId, ['oferta.csv', linha('M')])
    const versao = await criarVersao(periodoId, { nome: 'A' })
    const atribuicao = await db('atribuicao').where({ versao_id: versao.id }).first('id')
    const turnos = Object.fromEntries(
      (await db('turno').where({ periodo_id: periodoId })).map((t) => [t.nome, t.id])
    )
    const horario = await db('horario').where({ turno_id: turnos.Matutino }).first('id')
    const [aula] = await db('aula').insert({
      versao_id: versao.id,
      atribuicao_id: atribuicao.id,
      horario_id: horario.id,
    })
    const revisar = async () => (await db('aula').where({ id: aula }).first()).revisar

    // M → M, V: a aula da manhã continua valendo.
    const acrescenta = await previa(periodoId, ['oferta.csv', linha('M, V')])
    expect(acrescenta.arquivos[0].linhas[0].mudancas.map((m) => m.chaveCampo)).toContain('turnos')
    expect(acrescenta.impacto.aulas).toBe(0)
    await importar(periodoId, ['oferta.csv', linha('M, V')])
    expect(await revisar()).toBe(0)

    // M, V → V: a aula da manhã fica fora do turno.
    const retira = await previa(periodoId, ['oferta.csv', linha('V')])
    expect(retira.arquivos[0].linhas[0].aulasParaRevisar).toBe(1)
    await importar(periodoId, ['oferta.csv', linha('V')])
    expect(await revisar()).toBe(1)
  })

  it('não mistura a oferta com as planilhas separadas, salvo a de salas', async () => {
    const p = await previa(
      periodoId,
      ['oferta.csv', OFERTA],
      ['professores.csv', 'nome;siape\nAna;1234567\n'],
      ['salas.csv', 'Nome;Tipo;Capacidade\nSala 1;sala;40\n']
    )
    const porTipo = Object.fromEntries(p.arquivos.map((a) => [a.tipo, a]))
    expect(porTipo.professores.erro).toMatch(/envie só ela/)
    expect(porTipo.salas.erro).toBeUndefined()
    expect(porTipo.oferta.erro).toBeUndefined()
  })

  it('reaproveita turma e disciplina cadastradas pelas planilhas antigas', async () => {
    await importarTudo(periodoId) // INF1M, MAT1 (Matemática I), Ana Souza...
    const csv = [
      CABECALHO,
      '"2027.1";"INF1M";"Técnico em Informática";"1º ano";"Matemática I";"4";"Ana Souza"',
    ].join('\n')
    const p = await previa(periodoId, ['oferta.csv', csv])
    const [linha] = p.arquivos[0].linhas
    expect(linha.situacao).toBe('atualizar')
    expect(linha.mudancas.map((m) => m.campo)).toEqual(['Turma'])
    expect(linha.avisos).toEqual([])
    await importar(periodoId, ['oferta.csv', csv])
    expect(await db('turma').count({ n: '*' }).first()).toEqual({ n: 2 })
    expect((await db('turma').where({ codigo: 'INF1M' }).first()).chave_oferta).toBe(
      'inf1m|tecnico em informatica|1º ano'
    )
  })
})
