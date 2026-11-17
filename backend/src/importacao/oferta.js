// Importação pela planilha de oferta: cada linha é uma disciplina de uma turma,
// com o professor. Uma linha pode criar curso, turma, disciplina e professor, e
// cria ou atualiza a atribuição (turma + disciplina).
//
// Identificação, já que a planilha não traz SIAPE nem sigla:
//   professor  → nome (sem acento e sem diferenciar maiúscula)
//   disciplina → nome, ou a sigla se a coluna vier preenchida
//   turma      → turma + curso + período do curso (turma.chave_oferta)
//   atribuição → turma + disciplina
// O que a planilha não traz (turno, alunos, ambiente, SIAPE) fica com um valor
// padrão e é corrigido em Dados; reimportar não desfaz essas correções.

import { chave, normalizar } from './texto.js'
import { SITUACAO } from './classificacao.js'
import { chaveCurso } from './contexto.js'
import { buscarAulasAfetadas } from './impacto.js'
import { nivelDeEnsino } from './planilhas.js'

// ---------- Regras de inferência ----------

// Nível do curso pelo período ("1º ano" → integrado) ou, sem ele, pelo nome.
export function inferirNivel(curso, periodoCurso) {
  const p = normalizar(periodoCurso)
  if (/\bano\b/.test(p)) return 'integrado'
  if (/\bmodulo\b/.test(p)) return 'subsequente'
  if (/\b(periodo|semestre)\b/.test(p)) return 'superior'
  const explicito = nivelDeEnsino(curso)
  if (explicito) return explicito
  return /^tec\b|^tecnico\b/.test(normalizar(curso)) ? 'integrado' : 'superior'
}

const PALAVRAS_VAZIAS = new Set([
  'a',
  'o',
  'as',
  'os',
  'e',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'para',
  'por',
  'com',
  'ao',
  'aos',
  'à',
  'um',
  'uma',
])
const ROMANOS = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/

// "Desenvolvimento de Sistemas Web II" → "DSWII"; "Interação Humano-Computador" → "IHC".
export function siglaDe(nome) {
  const palavras = normalizar(nome)
    .split(' ')
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
  let sigla = ''
  for (const p of palavras) {
    if (ROMANOS.test(p) || /^\d+$/.test(p)) sigla += p.toUpperCase()
    else sigla += p[0].toUpperCase()
  }
  if (sigla.length < 2) sigla = (palavras[0] ?? 'DISC').slice(0, 4).toUpperCase()
  return sigla.slice(0, 16)
}

function siglaUnica(base, usadas) {
  let sigla = base
  for (let n = 2; usadas.has(chave(sigla)); n++) sigla = `${base}${n}`
  usadas.add(chave(sigla))
  return sigla
}

// Blocos de 2 aulas quando há pelo menos 2 (aulas geminadas são a regra).
const blocoPadrao = (aulas) => (aulas >= 2 ? 2 : 1)

export const chaveOferta = (turma, curso, periodoCurso) =>
  [turma, curso, periodoCurso ?? ''].map(chave).join('|')

// ---------- Contexto ----------

function lista(mapa, k, item) {
  if (!mapa.has(k)) mapa.set(k, [])
  mapa.get(k).push(item)
}

async function carregar(trx, periodoId, ctx) {
  const periodo = await trx('periodo_letivo').where({ id: periodoId }).first('nome')
  const [professores, disciplinas, turmas, atribuicoes, vinculos] = await Promise.all([
    trx('professor').select('id', 'nome'),
    trx('disciplina').select('id', 'sigla', 'nome', 'tipo_ambiente'),
    trx('turma')
      .where({ periodo_id: periodoId })
      .select('id', 'codigo', 'chave_oferta', 'turnos_permitidos', 'numero_alunos'),
    trx('atribuicao as a')
      .join('turma as t', 't.id', 'a.turma_id')
      .join('disciplina as d', 'd.id', 'a.disciplina_id')
      .where('a.periodo_id', periodoId)
      .whereNull('a.versao_id')
      .select(
        'a.id',
        'a.turma_id',
        'a.disciplina_id',
        'a.aulas_semanais',
        'a.tamanho_bloco',
        't.codigo as turma',
        'd.nome as disciplina'
      ),
    trx('atribuicao_professor as ap')
      .join('atribuicao as a', 'a.id', 'ap.atribuicao_id')
      .where('a.periodo_id', periodoId)
      .whereNull('a.versao_id')
      .select('ap.atribuicao_id', 'ap.professor_id'),
  ])
  const o = {
    periodoNome: periodo?.nome ?? '',
    turnos: ctx.turnos,
    cursos: ctx.cursos,
    professoresPorNome: new Map(),
    nomeProfessor: new Map(professores.map((p) => [p.id, p.nome])),
    disciplinasPorNome: new Map(),
    disciplinasPorSigla: new Map(),
    siglas: new Set(disciplinas.map((d) => chave(d.sigla))),
    turmasPorChave: new Map(),
    turmasPorCodigo: new Map(),
    atribuicoes: new Map(),
    // Criados por linhas anteriores do arquivo (registro compartilhado entre linhas).
    novos: { professores: new Map(), disciplinas: new Map(), turmas: new Map() },
    anunciados: new Set(),
    adotadas: new Set(),
  }
  for (const p of professores)
    lista(o.professoresPorNome, chave(p.nome), { id: p.id, nome: p.nome })
  for (const d of disciplinas) {
    const item = { id: d.id, sigla: d.sigla, nome: d.nome }
    lista(o.disciplinasPorNome, chave(d.nome), item)
    o.disciplinasPorSigla.set(chave(d.sigla), item)
  }
  for (const t of turmas) {
    const turnos =
      typeof t.turnos_permitidos === 'string'
        ? JSON.parse(t.turnos_permitidos)
        : t.turnos_permitidos
    const item = {
      id: t.id,
      codigo: t.codigo,
      chaveOferta: t.chave_oferta,
      turnos: [...(turnos ?? [])].sort((a, b) => a - b),
      numeroAlunos: t.numero_alunos,
    }
    if (t.chave_oferta) o.turmasPorChave.set(t.chave_oferta, item)
    o.turmasPorCodigo.set(chave(t.codigo), item)
  }
  const professoresDe = new Map()
  for (const v of vinculos) lista(professoresDe, v.atribuicao_id, v.professor_id)
  for (const a of atribuicoes) {
    o.atribuicoes.set(`${a.turma_id}|${a.disciplina_id}`, {
      id: a.id,
      turma: a.turma,
      disciplina: a.disciplina,
      aulasSemanais: a.aulas_semanais,
      tamanhoBloco: a.tamanho_bloco,
      professores: (professoresDe.get(a.id) ?? []).sort((x, y) => x - y),
      vista: false,
    })
  }
  return o
}

// ---------- Resolução de cada parte da linha ----------

function resolverTurnos(o, nomes, erros) {
  const ids = new Set()
  for (const nome of nomes) {
    const k = chave(nome)
    const exatos = o.turnos.filter((t) => t.chave === k)
    const achados = exatos.length ? exatos : o.turnos.filter((t) => t.chave.startsWith(k))
    if (achados.length === 1) ids.add(achados[0].id)
    else {
      const opcoes = o.turnos.map((t) => t.nome).join(', ')
      erros.push({
        coluna: 'Turno',
        mensagem: achados.length
          ? `Turno "${nome}" é ambíguo; use o nome completo (${opcoes})`
          : `Turno "${nome}" não existe no período (${opcoes})`,
      })
    }
  }
  return [...ids].sort((a, b) => a - b)
}

function codigoLivre(o, dados) {
  const tentativas = [
    dados.turma,
    `${dados.turma} (${dados.curso})`,
    `${dados.turma} (${dados.curso}, ${dados.periodoCurso ?? ''})`,
  ].map((c) => c.slice(0, 40))
  for (const c of tentativas) if (!o.turmasPorCodigo.has(chave(c))) return c
  for (let n = 2; ; n++) {
    const c = `${dados.turma.slice(0, 36)} ${n}`
    if (!o.turmasPorCodigo.has(chave(c))) return c
  }
}

function resolverTurma(o, dados, turnosDaLinha, avisos, numero) {
  const k = chaveOferta(dados.turma, dados.curso, dados.periodoCurso)
  let turma = o.turmasPorChave.get(k)
  if (!turma) {
    // Turma cadastrada antes (planilha antiga ou outra origem) com o mesmo nome e
    // ainda sem chave: passa a ser reconhecida por esta linha.
    const legado = o.turmasPorCodigo.get(chave(dados.turma))
    if (legado && !legado.chaveOferta && !o.adotadas.has(legado.id)) {
      o.adotadas.add(legado.id)
      turma = { ...legado, chaveOferta: k, adotar: true, linhaAdocao: numero }
      o.turmasPorChave.set(k, turma)
      o.turmasPorCodigo.set(chave(turma.codigo), turma)
    }
  }
  if (!turma) {
    const todos = o.turnos.map((t) => t.id)
    turma = {
      id: null,
      codigo: codigoLivre(o, dados),
      chaveOferta: k,
      curso: dados.curso,
      nivel: inferirNivel(dados.curso, dados.periodoCurso),
      turnos: turnosDaLinha.length ? turnosDaLinha : todos,
      turnosDefinidos: turnosDaLinha.length > 0,
      numeroAlunos: dados.numeroAlunos ?? 0,
      nova: true,
    }
    o.turmasPorChave.set(k, turma)
    o.turmasPorCodigo.set(chave(turma.codigo), turma)
    avisos.push(
      `Turma "${turma.codigo}" (${turma.curso}, ${turma.nivel}) será criada` +
        (turma.turnosDefinidos ? '' : ' com todos os turnos; defina o turno em Dados')
    )
    const kc = chaveCurso(turma.curso, turma.nivel)
    if (!o.cursos.has(kc) && !o.anunciados.has(kc)) {
      o.anunciados.add(kc)
      avisos.push(`Curso "${turma.curso}" (${turma.nivel}) será criado`)
    }
    o.cursos.set(kc, { id: null, nome: turma.curso, nivel: turma.nivel })
    return turma
  }
  // Turma existente: turno e alunos só mudam se a planilha trouxer as colunas.
  if (turnosDaLinha.length && turnosDaLinha.join() !== turma.turnos.join()) {
    turma.novosTurnos = turnosDaLinha
  }
  if (dados.numeroAlunos !== undefined && dados.numeroAlunos !== turma.numeroAlunos) {
    turma.novosAlunos = dados.numeroAlunos
  }
  return turma
}

function resolverDisciplina(o, dados, erros, avisos) {
  if (dados.sigla) {
    const porSigla = o.disciplinasPorSigla.get(chave(dados.sigla))
    if (porSigla) return porSigla
  }
  const k = chave(dados.disciplina)
  const novaNoArquivo = o.novos.disciplinas.get(k)
  if (novaNoArquivo) return novaNoArquivo
  const existentes = o.disciplinasPorNome.get(k) ?? []
  if (existentes.length === 1) return existentes[0]
  if (existentes.length > 1) {
    erros.push({
      coluna: 'Disciplina',
      mensagem: `Há ${existentes.length} disciplinas chamadas "${dados.disciplina}" (${existentes.map((d) => d.sigla).join(', ')}); informe a coluna Sigla`,
    })
    return null
  }
  const sigla =
    dados.sigla && !o.siglas.has(chave(dados.sigla))
      ? siglaUnica(dados.sigla, o.siglas)
      : siglaUnica(siglaDe(dados.disciplina), o.siglas)
  const nova = { id: null, sigla, nome: dados.disciplina, nova: true }
  o.novos.disciplinas.set(k, nova)
  o.disciplinasPorSigla.set(chave(sigla), nova)
  avisos.push(`Disciplina "${dados.disciplina}" será cadastrada com a sigla ${sigla}`)
  return nova
}

function resolverProfessores(o, nomes, erros, avisos) {
  const encontrados = []
  for (const nome of nomes) {
    const k = chave(nome)
    const novo = o.novos.professores.get(k)
    if (novo) {
      encontrados.push(novo)
      continue
    }
    const existentes = o.professoresPorNome.get(k) ?? []
    if (existentes.length === 1) encontrados.push(existentes[0])
    else if (existentes.length > 1) {
      erros.push({
        coluna: 'Professor',
        mensagem: `Há ${existentes.length} professores chamados "${nome}"; corrija o nome em Dados antes de importar`,
      })
    } else {
      const p = { id: null, nome, novo: true }
      o.novos.professores.set(k, p)
      encontrados.push(p)
      avisos.push(`Professor(a) ${nome} será cadastrado(a); complete SIAPE e e-mail em Dados`)
    }
  }
  return encontrados
}

// ---------- Classificação ----------

export async function classificarOferta(trx, periodoId, arquivo, ctx, validarLinha) {
  const o = await carregar(trx, periodoId, ctx)
  const linhas = []
  const vistas = new Map()

  for (const { numero, bruto } of arquivo.brutas) {
    const chaveBruta = `${bruto.turma ?? ''} · ${bruto.disciplina ?? ''}`
    const { dados, erros } = validarLinha('oferta', bruto)
    if (erros.length) {
      linhas.push({
        linha: numero,
        situacao: SITUACAO.REJEITAR,
        chave: chaveBruta,
        erros,
        avisos: [],
        mudancas: [],
      })
      continue
    }
    const errosLinha = []
    const avisos = []
    if (dados.semestre && chave(dados.semestre) !== chave(o.periodoNome)) {
      errosLinha.push({
        coluna: 'Semestre',
        mensagem: `A linha é do semestre ${dados.semestre}, mas o período escolhido é ${o.periodoNome}`,
      })
    }
    if (!o.turnos.length) {
      errosLinha.push({
        coluna: 'Turma',
        mensagem:
          'O período não tem turnos; configure os turnos e tempos de aula antes de importar',
      })
    }
    const turnos = resolverTurnos(o, dados.turno, errosLinha)
    const professores = resolverProfessores(o, dados.professores, errosLinha, avisos)
    const disciplina = resolverDisciplina(o, dados, errosLinha, avisos)
    if (errosLinha.length) {
      linhas.push({
        linha: numero,
        situacao: SITUACAO.REJEITAR,
        chave: chaveBruta,
        erros: errosLinha,
        avisos,
        mudancas: [],
      })
      continue
    }
    const turma = resolverTurma(o, dados, turnos, avisos, numero)

    const chaveLinha = `${turma.codigo} · ${disciplina.sigla} (${disciplina.nome})`
    const kAtribuicao = `${turma.id ?? `nova:${turma.chaveOferta}`}|${disciplina.id ?? `nova:${chave(disciplina.nome)}`}`
    const repetida = vistas.get(kAtribuicao)
    if (repetida) {
      linhas.push({
        linha: numero,
        situacao: SITUACAO.REJEITAR,
        chave: chaveLinha,
        erros: [
          {
            coluna: null,
            mensagem: `A mesma disciplina já aparece para esta turma na linha ${repetida}`,
          },
        ],
        avisos: [],
        mudancas: [],
      })
      continue
    }
    vistas.set(kAtribuicao, numero)

    const existente =
      turma.id && disciplina.id ? o.atribuicoes.get(`${turma.id}|${disciplina.id}`) : null
    if (existente) existente.vista = true
    const idsProfessores = professores.map((p) => p.id)
    const registro = {
      turma,
      disciplina,
      professores,
      atribuicao: {
        id: existente?.id ?? null,
        aulasSemanais: dados.aulasSemanais,
        tamanhoBloco:
          dados.tamanhoBloco ?? existente?.tamanhoBloco ?? blocoPadrao(dados.aulasSemanais),
        // Sem a coluna, o horário de destino mantém o bloco que já tem (ver compararComHorario).
        blocoInformado: dados.tamanhoBloco !== undefined,
      },
    }

    const mudancas = []
    if (existente) {
      if (existente.aulasSemanais !== dados.aulasSemanais)
        mudancas.push({
          campo: 'Aulas semanais',
          chaveCampo: 'aulasSemanais',
          de: existente.aulasSemanais,
          para: dados.aulasSemanais,
        })
      if (registro.atribuicao.tamanhoBloco !== existente.tamanhoBloco)
        mudancas.push({
          campo: 'Tamanho do bloco',
          chaveCampo: 'tamanhoBloco',
          de: existente.tamanhoBloco,
          para: registro.atribuicao.tamanhoBloco,
        })
      const antes = existente.professores.join()
      const depois = idsProfessores.every(Boolean)
        ? [...idsProfessores].sort((a, b) => a - b).join()
        : null
      if (antes !== depois) {
        mudancas.push({
          campo: 'Professores',
          chaveCampo: 'professores',
          de: existente.professores.map((id) => o.nomeProfessor.get(id)).join(', '),
          para: professores.map((p) => p.nome).join(', '),
        })
      }
    }
    if (turma.novosTurnos) {
      const nomes = (ids) => ids.map((id) => o.turnos.find((t) => t.id === id)?.nome).join(', ')
      mudancas.push({
        campo: 'Turnos da turma',
        chaveCampo: 'turnos',
        de: nomes(turma.turnos),
        para: nomes(turma.novosTurnos),
      })
    }
    if (turma.linhaAdocao === numero) {
      mudancas.push({
        campo: 'Turma',
        chaveCampo: 'chaveOferta',
        de: 'cadastrada antes',
        para: 'reconhecida pela oferta',
      })
    }
    if (turma.novosAlunos !== undefined) {
      mudancas.push({
        campo: 'Alunos da turma',
        chaveCampo: 'numeroAlunos',
        de: turma.numeroAlunos,
        para: turma.novosAlunos,
      })
    }
    if (registro.atribuicao.aulasSemanais % registro.atribuicao.tamanhoBloco !== 0) {
      avisos.push(
        `${registro.atribuicao.aulasSemanais} aulas em blocos de ${registro.atribuicao.tamanhoBloco}: um encontro terá bloco menor`
      )
    }

    const situacao = !existente
      ? SITUACAO.CRIAR
      : mudancas.length
        ? SITUACAO.ATUALIZAR
        : SITUACAO.INALTERADA
    linhas.push({
      linha: numero,
      situacao,
      chave: chaveLinha,
      erros: [],
      avisos,
      mudancas,
      registro,
    })
  }

  // Atribuições do período que o arquivo não cita continuam cadastradas: só avisa.
  const fora = [...o.atribuicoes.values()].filter((a) => !a.vista)
  const avisosArquivo = []
  if (fora.length && linhas.some((l) => l.situacao !== SITUACAO.REJEITAR)) {
    const nomes = fora.slice(0, 8).map((a) => `${a.turma} · ${a.disciplina}`)
    avisosArquivo.push(
      `${fora.length} atribuição(ões) do período não aparecem no arquivo e continuam cadastradas: ${nomes.join('; ')}${fora.length > 8 ? '…' : ''}. Exclua em Dados se saíram da oferta.`
    )
  }
  return { linhas, avisos: avisosArquivo }
}

// Aulas já alocadas afetadas pela oferta: atribuições alteradas e turmas com turno novo.
export async function impactoDaOferta(trx, periodoId, arquivo) {
  const atribuicoes = []
  const turmas = []
  for (const l of arquivo.linhas) {
    if (l.situacao !== SITUACAO.ATUALIZAR) continue
    const campos = l.mudancas.map((m) => m.chaveCampo)
    if (
      l.registro.atribuicao.id &&
      campos.some((c) => ['aulasSemanais', 'tamanhoBloco', 'professores'].includes(c))
    )
      atribuicoes.push(l.registro.atribuicao.id)
    if (l.registro.turma.id && campos.some((c) => c === 'turnos' || c === 'numeroAlunos'))
      turmas.push(l.registro.turma.id)
  }
  const aulas = await buscarAulasAfetadas(trx, { periodoId, atribuicoes, turmas })
  for (const l of arquivo.linhas) {
    if (l.situacao !== SITUACAO.ATUALIZAR) continue
    const n = aulas.filter(
      (a) =>
        a.atribuicao_id === l.registro.atribuicao.id ||
        (l.mudancas.some((m) => m.chaveCampo === 'turnos' || m.chaveCampo === 'numeroAlunos') &&
          a.turma_id === l.registro.turma.id)
    ).length
    if (n) l.aulasParaRevisar = n
  }
  return aulas
}

// ---------- Gravação ----------

export async function gravarOferta(trx, periodoId, arquivo) {
  const cursos = new Map()
  const idDoCurso = async (nome, nivel) => {
    const k = chaveCurso(nome, nivel)
    if (cursos.has(k)) return cursos.get(k)
    const existente = await trx('curso').where({ nome, nivel }).first('id')
    const id = existente?.id ?? (await trx('curso').insert({ nome, nivel }))[0]
    cursos.set(k, id)
    return id
  }

  for (const l of arquivo.linhas) {
    if (l.situacao !== SITUACAO.CRIAR && l.situacao !== SITUACAO.ATUALIZAR) continue
    const { turma, disciplina, professores, atribuicao } = l.registro

    // Os objetos de turma, disciplina e professor são compartilhados entre linhas:
    // o id gravado na primeira vale para as seguintes.
    if (!turma.id) {
      ;[turma.id] = await trx('turma').insert({
        periodo_id: periodoId,
        codigo: turma.codigo,
        chave_oferta: turma.chaveOferta,
        curso_id: await idDoCurso(turma.curso, turma.nivel),
        turnos_permitidos: JSON.stringify(turma.turnos),
        turnos_definidos: turma.turnosDefinidos,
        numero_alunos: turma.numeroAlunos,
      })
    } else if (turma.adotar || turma.novosTurnos || turma.novosAlunos !== undefined) {
      const campos = {}
      if (turma.adotar) campos.chave_oferta = turma.chaveOferta
      if (turma.novosTurnos) {
        campos.turnos_permitidos = JSON.stringify(turma.novosTurnos)
        campos.turnos_definidos = true
      }
      if (turma.novosAlunos !== undefined) campos.numero_alunos = turma.novosAlunos
      await trx('turma').where({ id: turma.id }).update(campos)
      turma.adotar = false
      if (turma.novosTurnos) turma.turnos = turma.novosTurnos
      if (turma.novosAlunos !== undefined) turma.numeroAlunos = turma.novosAlunos
      delete turma.novosTurnos
      delete turma.novosAlunos
    }

    if (!disciplina.id) {
      ;[disciplina.id] = await trx('disciplina').insert({
        sigla: disciplina.sigla,
        nome: disciplina.nome,
        tipo_ambiente: 'sala',
      })
    }

    for (const p of professores) {
      if (!p.id)
        [p.id] = await trx('professor').insert({
          nome: p.nome,
          siape: null,
          carga_maxima_semanal: 20,
        })
    }

    let id = atribuicao.id
    const campos = {
      aulas_semanais: atribuicao.aulasSemanais,
      tamanho_bloco: atribuicao.tamanhoBloco,
    }
    if (id) await trx('atribuicao').where({ id }).update(campos)
    else {
      ;[id] = await trx('atribuicao').insert({
        ...campos,
        periodo_id: periodoId,
        turma_id: turma.id,
        disciplina_id: disciplina.id,
      })
    }
    await trx('atribuicao_professor').where({ atribuicao_id: id }).delete()
    await trx('atribuicao_professor').insert(
      [...new Set(professores.map((p) => p.id))].map((professorId) => ({
        atribuicao_id: id,
        professor_id: professorId,
      }))
    )
  }
}

// ---------- Horário de destino ----------
// Importar "num horário": além da oferta do período, cada linha válida vira (ou
// atualiza) a atribuição daquele horário. Linhas do horário que o arquivo não
// cita ficam como estão.

const ordenar = (ids) => [...ids].sort((a, b) => a - b)

export async function compararComHorario(trx, versao, arquivo) {
  const doHorario = await trx('atribuicao')
    .where({ versao_id: versao.id })
    .select('id', 'turma_id', 'disciplina_id', 'aulas_semanais', 'tamanho_bloco')
  const vinculos = doHorario.length
    ? await trx('atribuicao_professor')
        .whereIn(
          'atribuicao_id',
          doHorario.map((a) => a.id)
        )
        .select('atribuicao_id', 'professor_id')
    : []
  const professoresDe = new Map()
  for (const v of vinculos) lista(professoresDe, v.atribuicao_id, v.professor_id)
  const porChave = new Map(doHorario.map((a) => [`${a.turma_id}|${a.disciplina_id}`, a]))
  const idsVinculados = [...new Set(vinculos.map((v) => v.professor_id))]
  const nomes = new Map(
    idsVinculados.length
      ? (await trx('professor').whereIn('id', idsVinculados).select('id', 'nome')).map((p) => [
          p.id,
          p.nome,
        ])
      : []
  )

  const resumo = { id: versao.id, nome: versao.nome, adicionar: 0, atualizar: 0, iguais: 0 }
  const atualizadas = []
  for (const l of arquivo.linhas) {
    if (l.situacao === SITUACAO.REJEITAR) continue
    const { turma, disciplina, professores, atribuicao } = l.registro
    const existente =
      turma.id && disciplina.id ? porChave.get(`${turma.id}|${disciplina.id}`) : undefined
    if (!existente) {
      l.horario = { acao: 'adicionar', mudancas: [] }
      l.registro.horario = { id: null }
      resumo.adicionar++
      continue
    }
    const mudancas = []
    if (existente.aulas_semanais !== atribuicao.aulasSemanais)
      mudancas.push({
        campo: 'Aulas semanais',
        de: existente.aulas_semanais,
        para: atribuicao.aulasSemanais,
      })
    // Bloco: o da planilha, se ela trouxer a coluna; senão o do horário (ajuste feito
    // nele), limitado às aulas da semana.
    const bloco = atribuicao.blocoInformado
      ? atribuicao.tamanhoBloco
      : Math.min(existente.tamanho_bloco, atribuicao.aulasSemanais)
    if (existente.tamanho_bloco !== bloco)
      mudancas.push({ campo: 'Tamanho do bloco', de: existente.tamanho_bloco, para: bloco })
    const antes = ordenar(professoresDe.get(existente.id) ?? [])
    const ids = professores.map((p) => p.id)
    if (!ids.every(Boolean) || antes.join() !== ordenar(new Set(ids)).join())
      mudancas.push({
        campo: 'Professores',
        de: antes.map((x) => nomes.get(x)).join(', '),
        para: professores.map((p) => p.nome).join(', '),
      })
    l.registro.horario = { id: existente.id, tamanhoBloco: bloco }
    if (mudancas.length) {
      l.horario = { acao: 'atualizar', mudancas }
      resumo.atualizar++
      atualizadas.push(existente.id)
    } else {
      l.horario = { acao: 'igual', mudancas: [] }
      resumo.iguais++
    }
  }

  // Aulas já alocadas no horário das atribuições que mudam: ficam marcadas para revisão.
  const aulas = atualizadas.length
    ? await trx('aula')
        .where({ versao_id: versao.id })
        .whereIn('atribuicao_id', atualizadas)
        .pluck('id')
    : []
  resumo.aulasParaRevisar = aulas.length
  return { resumo, aulas }
}

// Depois de gravarOferta (turma, disciplina e professores já têm id).
export async function gravarNoHorario(trx, periodoId, versaoId, arquivo) {
  for (const l of arquivo.linhas) {
    if (!l.horario || l.horario.acao === 'igual') continue
    const { turma, disciplina, professores, atribuicao } = l.registro
    const professoresIds = [...new Set(professores.map((p) => p.id))]
    let id = l.registro.horario.id
    if (id) {
      await trx('atribuicao').where({ id }).update({
        aulas_semanais: atribuicao.aulasSemanais,
        tamanho_bloco: l.registro.horario.tamanhoBloco,
      })
      await trx('atribuicao_professor').where({ atribuicao_id: id }).delete()
    } else {
      const base = await trx('atribuicao')
        .where({ periodo_id: periodoId, turma_id: turma.id, disciplina_id: disciplina.id })
        .whereNull('versao_id')
        .first('grupo_paralelo')
      ;[id] = await trx('atribuicao').insert({
        periodo_id: periodoId,
        versao_id: versaoId,
        turma_id: turma.id,
        disciplina_id: disciplina.id,
        aulas_semanais: atribuicao.aulasSemanais,
        tamanho_bloco: atribuicao.tamanhoBloco,
        grupo_paralelo: base?.grupo_paralelo ?? null,
      })
    }
    await trx('atribuicao_professor').insert(
      professoresIds.map((professorId) => ({ atribuicao_id: id, professor_id: professorId }))
    )
  }
}
