// F5-02 a F5-04 — Exportações de uma versão.
//   PDF por turma, por professor e por sala: uma página por recurso, pronta para mural.
//   PDF consolidado do campus: capa com sumário e todas as turmas, professores e salas.
//   XLSX: todas as aulas em lista, uma por linha, para lançar no SUAP.

import path from 'node:path'
import ExcelJS from 'exceljs'
import pdfmake from 'pdfmake'
import fontesRoboto from 'pdfmake/fonts/Roboto.js'
import { db } from '../db/knex.js'
import { ErroNaoEncontrado, ErroValidacao } from '../erros.js'
import { obterGradeHoraria } from './periodos.js'
import { aulasDaVersao, resumoVersao } from './versoes.js'

// pdfmake no servidor: só as fontes Roboto do próprio pacote; nada de URL externa.
// path.resolve normaliza as barras (no Windows o pacote mistura "/" e "\").
const pastaFontes = path.resolve(path.dirname(fontesRoboto.Roboto.normal))
pdfmake.setFonts(fontesRoboto)
pdfmake.setUrlAccessPolicy(() => false)
pdfmake.setLocalAccessPolicy((caminho) => path.resolve(caminho).startsWith(pastaFontes))

const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const INSTITUICAO = 'IFMA Campus Coelho Neto'
const VERDE = '#1f5e22'

export const TIPOS_PDF = ['turma', 'professor', 'sala', 'campus']
const TITULOS = { turma: 'Turmas', professor: 'Professores', sala: 'Salas' }

const dataHora = (d = new Date()) =>
  d.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Fortaleza',
  })

// Nome de arquivo sem acento nem espaço.
export const nomeDeArquivo = (...partes) =>
  partes
    .filter(Boolean)
    .join('-')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()

// Tudo o que as exportações precisam de uma versão.
export async function carregarGrade(periodoId, versaoId) {
  const periodo = await db('periodo_letivo').where({ id: periodoId }).first()
  if (!periodo) throw new ErroNaoEncontrado('Período letivo não encontrado')
  const versao = await resumoVersao(periodoId, versaoId)
  const [gradeHoraria, aulas, turmas] = await Promise.all([
    obterGradeHoraria(periodoId),
    aulasDaVersao(periodoId, versaoId),
    db('turma').where({ periodo_id: periodoId }).orderBy('codigo'),
  ])
  const professores = new Map()
  const salas = new Map()
  for (const a of aulas) {
    for (const p of a.professores) professores.set(p.id, p.nome)
    if (a.salaId) salas.set(a.salaId, a.sala)
  }
  const ordenar = (mapa) =>
    [...mapa].map(([id, nome]) => ({ id, nome })).sort((x, y) => x.nome.localeCompare(y.nome))
  return {
    periodo: { id: periodo.id, nome: periodo.nome },
    versao,
    gradeHoraria,
    aulas,
    recursos: {
      turma: turmas.map((t) => ({
        id: t.id,
        nome: t.codigo,
        turnos:
          typeof t.turnos_permitidos === 'string'
            ? JSON.parse(t.turnos_permitidos)
            : t.turnos_permitidos,
        // Falso para turma vinda da oferta sem turno: "turnos" traz todos, por enquanto.
        turnosDefinidos: t.turnos_definidos == null ? true : !!t.turnos_definidos,
      })),
      professor: ordenar(professores),
      sala: ordenar(salas),
    },
  }
}

const daVisao = (tipo, id) => (a) => {
  if (tipo === 'turma') return a.turmaId === id
  if (tipo === 'professor') return a.professores.some((p) => p.id === id)
  return a.salaId === id
}

const nomesProfessores = (a) => a.professores.map((p) => p.nome).join(', ') || 'sem professor'

// Texto do cartão conforme a visão (o mesmo critério da tela).
function linhasDaAula(tipo, a) {
  if (tipo === 'turma') return [nomesProfessores(a), a.sala ?? 'sem sala']
  if (tipo === 'professor') return [a.turma, a.sala ?? 'sem sala']
  return [a.turma, nomesProfessores(a)]
}

// ---------- PDF ----------

function tabelaDaGrade(dados, tipo, recurso) {
  const { gradeHoraria } = dados
  const aulas = dados.aulas.filter(daVisao(tipo, recurso.id))
  const horario = new Map(gradeHoraria.horarios.map((h) => [h.id, h]))
  const porCelula = new Map()
  // Só os turnos em que há aula; sem aula, os permitidos da turma.
  const usados = new Set()
  for (const a of aulas) {
    const h = horario.get(a.horarioId)
    if (!h) continue
    usados.add(h.turnoId)
    const chave = `${h.turnoId}|${h.diaSemana}|${h.ordem}`
    if (!porCelula.has(chave)) porCelula.set(chave, [])
    porCelula.get(chave).push(a)
  }
  if (!usados.size) for (const t of recurso.turnos ?? []) usados.add(t)
  const turnos = gradeHoraria.turnos.filter((t) => usados.has(t.id))
  const dias = gradeHoraria.dias

  const cabecalho = [
    { text: 'Tempo', style: 'cabecalho' },
    ...dias.map((d) => ({ text: DIAS[d], style: 'cabecalho' })),
  ]
  const corpo = [cabecalho]
  for (const turno of turnos.length ? turnos : gradeHoraria.turnos) {
    corpo.push([
      { text: turno.nome, style: 'turno', colSpan: dias.length + 1 },
      ...dias.map(() => ''),
    ])
    for (const tempo of turno.tempos) {
      corpo.push([
        {
          text: [{ text: `${tempo.ordem}º\n`, bold: true }, `${tempo.horaInicio}–${tempo.horaFim}`],
          style: 'tempo',
        },
        ...dias.map((d) => {
          const lista = porCelula.get(`${turno.id}|${d}|${tempo.ordem}`) ?? []
          if (!lista.length) return ''
          return {
            stack: lista.map((a, k) => {
              const [l1, l2] = linhasDaAula(tipo, a)
              return {
                text: [
                  { text: a.sigla, bold: true },
                  `\n${l1}`,
                  { text: `\n${l2}`, color: '#555555' },
                ],
                margin: [0, k ? 3 : 0, 0, 0],
              }
            }),
            fillColor: lista.length > 1 ? '#fde2e1' : null,
          }
        }),
      ])
    }
  }
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [52, ...dias.map(() => '*')],
      body: corpo,
    },
    layout: {
      hLineColor: () => '#bbbbbb',
      vLineColor: () => '#bbbbbb',
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    fontSize: 8,
    totalAulas: aulas.length,
  }
}

// ---------- Página da turma (modelo do campus) ----------
// Logo, "Campus Coelho Neto - período", turma e turno; dias no cabeçalho; em cada
// tempo, a disciplina (maior, em negrito) no alto e o professor embaixo, sem cores.
// Turma de um turno sai em paisagem; de dois ou mais, em retrato.

const A4 = { largura: 595.28, altura: 841.89 }
const IF_VERDE = '#2f9e41'
const IF_VERMELHO = '#c8191e'
const LINHA_FORTE = 1.2
const LINHA_FINA = 0.6

// Marca do Instituto Federal: círculo vermelho e quadrados verdes (3, 2, 3, 2).
function logoIF(lado = 11, espaco = 2) {
  const linhas = [3, 2, 3, 2]
  const formas = []
  linhas.forEach((n, l) => {
    for (let c = 0; c < n; c++) {
      const x = c * (lado + espaco)
      const y = l * (lado + espaco)
      formas.push(
        l === 0 && c === 0
          ? {
              type: 'ellipse',
              x: x + lado / 2,
              y: y + lado / 2,
              r1: lado / 2,
              r2: lado / 2,
              color: IF_VERMELHO,
            }
          : { type: 'rect', x, y, w: lado, h: lado, color: IF_VERDE }
      )
    }
  })
  return { canvas: formas, width: 3 * lado + 2 * espaco }
}

// Estimativa de quebra de linha (Roboto: largura média do caractere em "em"), para
// escolher o maior tamanho de fonte que cabe na célula sem alargar a coluna nem
// esticar a linha da tabela (o que empurraria o quadro para outra página).
const EM = { normal: 0.56, negrito: 0.6 }
const ALTURA_DA_LINHA = 1.17

function linhasDoTexto(texto, tamanho, largura, negrito) {
  const em = (negrito ? EM.negrito : EM.normal) * tamanho
  let linhas = 1
  let atual = 0
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const w = palavra.length * em
    if (w > largura) return Infinity
    const comEspaco = atual ? atual + em * 0.5 + w : w
    if (comEspaco > largura) {
      linhas++
      atual = w
    } else atual = comEspaco
  }
  return linhas
}

export function tamanhoQueCabe(texto, { base, minimo, largura, altura, negrito = false }) {
  for (let t = base; t > minimo; t -= 0.5) {
    if (linhasDoTexto(texto, t, largura, negrito) * t * ALTURA_DA_LINHA <= altura) return t
  }
  return minimo
}

const horaCurta = (h) => h.replace(/^0(\d)/, '$1')
// "Maria Irisnete Barbosa Lima" → "Maria Lima", como no modelo.
function nomeCurto(nome) {
  const partes = nome.trim().split(/\s+/)
  return partes.length > 2 ? `${partes[0]} ${partes.at(-1)}` : nome.trim()
}

// Turnos da página, na ordem do período: os definidos para a turma (mesmo vazios,
// como no modelo) e os que têm aula. Turma com turno "a definir" fica só com os
// turnos em que tem aula.
function turnosDaTurma(dados, turma, aulas) {
  const horario = new Map(dados.gradeHoraria.horarios.map((h) => [h.id, h]))
  const usados = new Set(turma.turnosDefinidos === false ? [] : (turma.turnos ?? []))
  for (const a of aulas) {
    const h = horario.get(a.horarioId)
    if (h) usados.add(h.turnoId)
  }
  if (!usados.size) for (const t of turma.turnos ?? []) usados.add(t)
  const lista = dados.gradeHoraria.turnos.filter((t) => usados.has(t.id))
  return lista.length ? lista : dados.gradeHoraria.turnos
}

export const orientacaoDaTurma = (turnos) => (turnos.length <= 1 ? 'landscape' : 'portrait')

function paginaDaTurma(dados, turma, { quebra, sumario, margens }) {
  const { gradeHoraria, periodo } = dados
  const aulas = dados.aulas.filter(daVisao('turma', turma.id))
  const horario = new Map(gradeHoraria.horarios.map((h) => [h.id, h]))
  const turnos = turnosDaTurma(dados, turma, aulas)
  const orientacao = orientacaoDaTurma(turnos)
  const retrato = orientacao === 'portrait'
  const dias = gradeHoraria.dias

  const porCelula = new Map()
  const aulasPorTurno = new Map()
  for (const a of aulas) {
    const h = horario.get(a.horarioId)
    if (!h) continue
    const chave = `${h.turnoId}|${h.diaSemana}|${h.ordem}`
    if (!porCelula.has(chave)) porCelula.set(chave, [])
    porCelula.get(chave).push(a)
    aulasPorTurno.set(h.turnoId, (aulasPorTurno.get(h.turnoId) ?? 0) + 1)
  }
  // Turno do título: o que concentra as aulas da turma (como no modelo).
  const principal = [...turnos].sort(
    (x, y) => (aulasPorTurno.get(y.id) ?? 0) - (aulasPorTurno.get(x.id) ?? 0)
  )[0]

  // Alturas: o quadro ocupa a página toda, como no modelo.
  const pagina = retrato ? A4 : { largura: A4.altura, altura: A4.largura }
  const [, topo, , base] = margens
  const alturaTitulo = 66
  const alturaCabecalho = retrato ? 46 : 34
  const totalTempos = turnos.reduce((s, t) => s + t.tempos.length, 0)
  const PAD = 2
  // As linhas da tabela também ocupam altura; a folga evita que o fim vá para outra página.
  const linhas = (totalTempos + 3) * LINHA_FORTE
  const disponivel =
    pagina.altura - topo - base - alturaTitulo - alturaCabecalho - 2 * PAD - linhas - 12
  const porTempo = Math.max(30, Math.min(90, Math.floor(disponivel / totalTempos)))
  // Com muitos tempos (três turnos em retrato), as linhas ficam baixas: fontes um pouco menores.
  const compacto = porTempo < 46
  const fonte = retrato
    ? compacto
      ? { disciplina: 9.5, professor: 8.5, tempo: 10, hora: 8 }
      : { disciplina: 11, professor: 9.5, tempo: 11.5, hora: 9 }
    : { disciplina: 12, professor: 10.5, tempo: 12.5, hora: 10 }
  const alturaProfessor = Math.ceil(fonte.professor * 1.2)
  const alturaDisciplina = porTempo - alturaProfessor - 2 * PAD
  const larguraTempo = retrato ? 66 : 76
  const [esquerda, , direita] = margens
  const larguraCelula =
    (pagina.largura - esquerda - direita - larguraTempo) / dias.length - 2 * 3 - LINHA_FINA
  const disciplinaDa = (texto) =>
    tamanhoQueCabe(texto, {
      base: fonte.disciplina,
      minimo: 6.5,
      largura: larguraCelula,
      altura: alturaDisciplina,
      negrito: true,
    })
  const professorDa = (texto) =>
    tamanhoQueCabe(texto, {
      base: fonte.professor,
      minimo: 6,
      largura: larguraCelula,
      altura: alturaProfessor,
    })

  const corpo = [
    [
      { text: '' },
      ...dias.map((d) => ({
        text: DIAS[d],
        bold: true,
        fontSize: retrato ? 17 : 15,
        alignment: 'center',
        verticalAlignment: 'middle',
      })),
    ],
  ]
  const inicioDeTurno = new Set() // índice da linha onde começa um turno
  for (const turno of turnos) {
    inicioDeTurno.add(corpo.length)
    for (const tempo of turno.tempos) {
      const celulas = dias.map((d) => porCelula.get(`${turno.id}|${d}|${tempo.ordem}`) ?? [])
      // Linha de cima: tempo e disciplina.
      corpo.push([
        {
          text: `${tempo.ordem}º Horário`,
          fontSize: fonte.tempo,
          alignment: 'center',
          verticalAlignment: 'middle',
        },
        ...celulas.map((lista) => {
          const texto = [...new Set(lista.map((a) => a.disciplina))].join(' / ')
          return { text: texto, bold: true, fontSize: disciplinaDa(texto), alignment: 'center' }
        }),
      ])
      // Linha de baixo: horário e professor.
      corpo.push([
        {
          text: `${horaCurta(tempo.horaInicio)} - ${horaCurta(tempo.horaFim)}`,
          fontSize: fonte.hora,
          alignment: 'center',
        },
        ...celulas.map((lista) => {
          const texto = [
            ...new Set(lista.flatMap((a) => a.professores.map((p) => nomeCurto(p.nome)))),
          ].join(' / ')
          return { text: texto, fontSize: professorDa(texto), alignment: 'center' }
        }),
      ])
    }
  }

  const ultima = corpo.length
  const titulo = {
    columns: [
      logoIF(retrato ? 12 : 11),
      {
        stack: [
          { text: `Campus Coelho Neto - ${periodo.nome}`, fontSize: retrato ? 20 : 19 },
          {
            text: `${turma.nome} - ${principal.nome}`,
            fontSize: retrato ? 14 : 13,
            tocItem: sumario ? 'sumario-turma' : false,
          },
        ],
        alignment: 'center',
        margin: [0, 6, 0, 0],
      },
      // Contrapeso do logo, para o título ficar no centro da página.
      { text: '', width: retrato ? 40 : 37 },
    ],
    margin: [0, 0, 0, alturaTitulo - 56],
    pageBreak: quebra ? 'before' : undefined,
    pageOrientation: orientacao,
  }

  return {
    orientacao,
    conteudo: [
      titulo,
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [larguraTempo, ...dias.map(() => '*')],
          heights: (linha) =>
            linha === 0 ? alturaCabecalho : linha % 2 ? alturaDisciplina : alturaProfessor,
          body: corpo,
        },
        layout: {
          hLineWidth: (i) => {
            if (i === 0 || i === 1 || i === ultima) return LINHA_FORTE
            if (i % 2 === 0) return 0 // entre a disciplina e o professor do mesmo tempo
            return inicioDeTurno.has(i) ? LINHA_FORTE : LINHA_FINA
          },
          vLineWidth: (i, no) =>
            i === 0 || i === no.table.widths.length ? LINHA_FORTE : LINHA_FINA,
          hLineColor: () => '#000000',
          vLineColor: () => '#000000',
          paddingLeft: () => 3,
          paddingRight: () => 3,
          paddingTop: (i) => (i % 2 === 0 && i > 0 ? 0 : PAD),
          paddingBottom: (i) => (i % 2 === 1 ? 0 : PAD),
        },
      },
    ],
  }
}

function paginaDoRecurso(dados, tipo, recurso, { quebra, sumario }) {
  const { totalAulas, ...tabela } = tabelaDaGrade(dados, tipo, recurso)
  const rotulo = { turma: 'Turma', professor: 'Professor(a)', sala: 'Sala' }[tipo]
  // "Sala 01" já diz que é sala; "Lab. Informática" ganha o prefixo.
  const jaTemRotulo = recurso.nome.toLowerCase().startsWith(rotulo.toLowerCase())
  return [
    {
      text: jaTemRotulo ? recurso.nome : `${rotulo} ${recurso.nome}`,
      style: 'titulo',
      pageBreak: quebra ? 'before' : undefined,
      // No PDF do campus, volta à paisagem depois das páginas de turma em retrato.
      pageOrientation: quebra ? 'landscape' : undefined,
      tocItem: sumario ? `sumario-${tipo}` : false,
    },
    {
      text: `${totalAulas} aula(s) por semana`,
      style: 'subtitulo',
    },
    tabela,
  ]
}

const MARGENS = [28, 46, 28, 36]
// PDF só de turmas: sem cabeçalho de página, o título do modelo ocupa o topo.
const MARGENS_TURMA = [22, 18, 22, 26]

function documento(dados, conteudo, titulo, { orientacao = 'landscape', soTurmas = false } = {}) {
  const { periodo, versao } = dados
  const situacao = versao.publicada ? 'versão publicada' : 'versão de trabalho, não publicada'
  if (soTurmas) {
    return {
      ...documento(dados, conteudo, titulo),
      pageOrientation: orientacao,
      pageMargins: MARGENS_TURMA,
      header: null,
      footer: (pagina, total) => ({
        columns: [
          {
            text: `${versao.nome}${versao.publicada ? '' : ' (não publicada)'}`,
          },
          {
            text: `Gerado em ${dataHora()}${total > 1 ? ` · Página ${pagina} de ${total}` : ''}`,
            alignment: 'right',
          },
        ],
        margin: [MARGENS_TURMA[0], 6, MARGENS_TURMA[2], 0],
        fontSize: 9,
      }),
    }
  }
  return {
    pageSize: 'A4',
    pageOrientation: orientacao,
    pageMargins: MARGENS,
    info: { title: titulo, author: INSTITUICAO, subject: `Horário ${periodo.nome}` },
    header: {
      columns: [
        { text: `${INSTITUICAO} · Horário ${periodo.nome}`, bold: true, color: VERDE },
        { text: `${versao.nome} (${situacao})`, alignment: 'right', color: '#555555' },
      ],
      margin: [28, 18, 28, 0],
      fontSize: 8,
    },
    footer: (pagina, total) => ({
      columns: [
        { text: `Gerado em ${dataHora()}`, color: '#777777' },
        { text: `Página ${pagina} de ${total}`, alignment: 'right', color: '#777777' },
      ],
      margin: [28, 10, 28, 0],
      fontSize: 7,
    }),
    content: conteudo,
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: {
      titulo: { fontSize: 16, bold: true, margin: [0, 0, 0, 2] },
      subtitulo: { fontSize: 9, color: '#555555', margin: [0, 0, 0, 8] },
      cabecalho: { bold: true, fillColor: VERDE, color: '#ffffff', alignment: 'center' },
      turno: { bold: true, fillColor: '#e9f2e9', color: VERDE },
      tempo: { color: '#333333' },
      capa: { fontSize: 24, bold: true, color: VERDE, margin: [0, 120, 0, 8] },
    },
  }
}

// tipo: turma | professor | sala (recursoId opcional: só aquele) | campus.
export async function gerarPdf(dados, { tipo, recursoId = null }) {
  if (!TIPOS_PDF.includes(tipo)) throw new ErroValidacao([], `Tipo de PDF inválido: ${tipo}`)
  let conteudo
  let titulo
  let nomeArquivo
  if (tipo === 'campus') {
    const { periodo, versao, recursos } = dados
    conteudo = [
      { text: `Horário ${periodo.nome}`, style: 'capa' },
      { text: INSTITUICAO, fontSize: 14, margin: [0, 0, 0, 4] },
      {
        text: `${versao.nome} · ${dados.aulas.length} aulas · ${recursos.turma.length} turmas, ${recursos.professor.length} professores, ${recursos.sala.length} salas`,
        color: '#555555',
        margin: [0, 0, 0, 24],
      },
      ...['turma', 'professor', 'sala'].map((t) => ({
        toc: { id: `sumario-${t}`, title: { text: TITULOS[t], bold: true, margin: [0, 8, 0, 4] } },
      })),
    ]
    for (const r of recursos.turma)
      conteudo.push(
        ...paginaDaTurma(dados, r, { quebra: true, sumario: true, margens: MARGENS }).conteudo
      )
    for (const t of ['professor', 'sala']) {
      for (const r of recursos[t])
        conteudo.push(...paginaDoRecurso(dados, t, r, { quebra: true, sumario: true }))
    }
    titulo = `Horário ${periodo.nome} — campus`
    nomeArquivo = nomeDeArquivo('horario', periodo.nome, 'campus') + '.pdf'
  } else if (tipo === 'turma') {
    let lista = dados.recursos.turma
    if (recursoId != null) {
      lista = lista.filter((r) => r.id === recursoId)
      if (!lista.length) throw new ErroNaoEncontrado('Recurso sem aulas nesta versão')
    }
    if (!lista.length) throw new ErroValidacao([], 'Nenhum(a) turma com aulas nesta versão')
    const paginas = lista.map((r, k) =>
      paginaDaTurma(dados, r, { quebra: k > 0, sumario: false, margens: MARGENS_TURMA })
    )
    const escopo = recursoId != null ? lista[0].nome : TITULOS.turma
    titulo = `Horário ${dados.periodo.nome} — ${escopo}`
    nomeArquivo = nomeDeArquivo('horario', dados.periodo.nome, escopo) + '.pdf'
    const doc = documento(
      dados,
      paginas.flatMap((p) => p.conteudo),
      titulo,
      { orientacao: paginas[0].orientacao, soTurmas: true }
    )
    return { buffer: await pdfmake.createPdf(doc).getBuffer(), nomeArquivo }
  } else {
    let lista = dados.recursos[tipo]
    if (recursoId != null) {
      lista = lista.filter((r) => r.id === recursoId)
      if (!lista.length) throw new ErroNaoEncontrado('Recurso sem aulas nesta versão')
    }
    if (!lista.length) throw new ErroValidacao([], `Nenhum(a) ${tipo} com aulas nesta versão`)
    conteudo = lista.flatMap((r, k) => paginaDoRecurso(dados, tipo, r, { quebra: k > 0 }))
    const escopo = recursoId != null ? lista[0].nome : TITULOS[tipo]
    titulo = `Horário ${dados.periodo.nome} — ${escopo}`
    nomeArquivo = nomeDeArquivo('horario', dados.periodo.nome, escopo) + '.pdf'
  }
  const buffer = await pdfmake.createPdf(documento(dados, conteudo, titulo)).getBuffer()
  return { buffer, nomeArquivo }
}

// ---------- XLSX para o SUAP ----------

export async function gerarXlsx(dados) {
  const { periodo, versao, gradeHoraria, aulas } = dados
  const horario = new Map(gradeHoraria.horarios.map((h) => [h.id, h]))
  const turno = new Map(gradeHoraria.turnos.map((t) => [t.id, t]))
  const ids = [...new Set(aulas.flatMap((a) => a.professores.map((p) => p.id)))]
  const siapes = new Map(
    (ids.length ? await db('professor').whereIn('id', ids).select('id', 'siape') : []).map((p) => [
      p.id,
      p.siape,
    ])
  )

  const linhas = aulas
    .map((a) => ({ a, h: horario.get(a.horarioId) }))
    .filter(({ h }) => h)
    .sort(
      (x, y) =>
        x.a.turma.localeCompare(y.a.turma) ||
        x.h.diaSemana - y.h.diaSemana ||
        turno.get(x.h.turnoId).ordem - turno.get(y.h.turnoId).ordem ||
        x.h.ordem - y.h.ordem
    )

  const livro = new ExcelJS.Workbook()
  livro.creator = INSTITUICAO
  livro.created = new Date()
  const planilha = livro.addWorksheet('Aulas', { views: [{ state: 'frozen', ySplit: 1 }] })
  planilha.columns = [
    { header: 'Turma', key: 'turma', width: 12 },
    { header: 'Sigla', key: 'sigla', width: 10 },
    { header: 'Disciplina', key: 'disciplina', width: 32 },
    { header: 'Professores', key: 'professores', width: 32 },
    { header: 'SIAPE', key: 'siape', width: 16 },
    { header: 'Dia', key: 'dia', width: 10 },
    { header: 'Dia (número)', key: 'diaNumero', width: 12 },
    { header: 'Turno', key: 'turno', width: 12 },
    { header: 'Tempo', key: 'tempo', width: 8 },
    { header: 'Início', key: 'inicio', width: 8 },
    { header: 'Fim', key: 'fim', width: 8 },
    { header: 'Sala', key: 'sala', width: 20 },
    { header: 'Fixada', key: 'fixada', width: 8 },
  ]
  for (const { a, h } of linhas) {
    planilha.addRow({
      turma: a.turma,
      sigla: a.sigla,
      disciplina: a.disciplina,
      professores: a.professores.map((p) => p.nome).join('; '),
      siape: a.professores.map((p) => siapes.get(p.id) ?? '').join('; '),
      dia: DIAS[h.diaSemana],
      diaNumero: h.diaSemana,
      turno: turno.get(h.turnoId).nome,
      tempo: h.ordem,
      inicio: h.horaInicio,
      fim: h.horaFim,
      sala: a.sala ?? '',
      fixada: a.fixada ? 'sim' : 'não',
    })
  }
  planilha.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  planilha.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5E22' } }
  planilha.autoFilter = { from: 'A1', to: 'M1' }

  const sobre = livro.addWorksheet('Sobre')
  sobre.columns = [{ width: 22 }, { width: 60 }]
  sobre.addRows([
    ['Instituição', INSTITUICAO],
    ['Período', periodo.nome],
    ['Versão', `${versao.nome}${versao.publicada ? ' (publicada)' : ' (não publicada)'}`],
    ['Aulas', linhas.length],
    ['Gerado em', dataHora()],
    ['Formato', 'Uma linha por aula. Dia (número): 1 = segunda ... 6 = sábado.'],
  ])
  sobre.getColumn(1).font = { bold: true }

  return {
    buffer: Buffer.from(await livro.xlsx.writeBuffer()),
    nomeArquivo: nomeDeArquivo('aulas', periodo.nome, versao.nome) + '.xlsx',
  }
}

// Cabeçalhos de download com nome em UTF-8 (RFC 5987).
export function enviarArquivo(res, { buffer, nomeArquivo }, tipoConteudo) {
  res.set({
    'Content-Type': tipoConteudo,
    'Content-Disposition': `attachment; filename="${nomeArquivo}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
    'Content-Length': buffer.length,
  })
  res.send(buffer)
}

export const PDF = 'application/pdf'
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
