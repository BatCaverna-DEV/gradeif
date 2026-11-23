// F1-21 — Consulta e correção pontual dos cadastros.
// A fonte primária continua sendo a importação. Aqui há listagem, correção de um
// registro, exclusão quando nada depende dele e cadastro manual de professores
// (um substituto que não estava na oferta), de disciplinas e de turmas do
// semestre (período).
// Correções que afetam aulas já alocadas marcam essas aulas para revisão (como na F1-19).
import { z } from 'zod'
import { db } from '../db/knex.js'
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from '../erros.js'
import { chave, tipoAmbiente } from '../importacao/texto.js'
import {
  aulasAfetadasPelaTurma,
  marcarAulas,
  marcarParaRevisao,
  mudancaAfetaGrade,
} from '../importacao/impacto.js'
import { siglaDe } from '../importacao/oferta.js'
import { corDoProfessor, FORMATO_COR } from '../core/cores.js'

// ---------- Utilitários ----------

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : (v ?? null))

const texto = (max) =>
  z
    .string({ error: 'Campo obrigatório' })
    .trim()
    .min(1, 'Campo obrigatório')
    .max(max, `Use no máximo ${max} caracteres`)

const textoOpcional = (max) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .nullish()
    .transform((v) => v || null)

const inteiro = (min, max, mensagem) =>
  z
    .number({ error: 'Informe um número inteiro' })
    .int('Informe um número inteiro')
    .min(min, mensagem ?? `O valor mínimo é ${min}`)
    .max(max, `O valor máximo é ${max}`)

async function exigir(trx, tabela, where, mensagem) {
  const linha = await trx(tabela).where(where).first()
  if (!linha) throw new ErroNaoEncontrado(mensagem)
  return linha
}

// Mesma chave em outro registro: 409 com mensagem clara em vez do erro genérico do banco.
async function garantirUnico(trx, tabela, where, idAtual, mensagem) {
  const outro = await trx(tabela).where(where).whereNot({ id: idAtual }).first('id')
  if (outro) throw new ErroConflito(mensagem)
}

function alterados(antes, depois) {
  return Object.keys(depois).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
}

async function contar(consulta) {
  const r = await consulta.count({ n: '*' }).first()
  return Number(r?.n ?? 0)
}

// ---------- Professores ----------

const professores = {
  esquema: z.object({
    nome: texto(120),
    // Opcional: professores vindos da planilha de oferta chegam sem SIAPE.
    siape: z
      .union([
        z.literal(''),
        z
          .string()
          .trim()
          .regex(/^\d{4,12}$/, 'O SIAPE deve conter só dígitos (4 a 12)'),
      ])
      .nullish()
      .transform((v) => v || null),
    email: z
      .union([z.literal(''), z.email('E-mail inválido').max(120)])
      .nullish()
      .transform((v) => (v ? v.toLowerCase() : null)),
    // Cor nas grades; vazia = automática.
    cor: z
      .union([z.literal(''), z.string().regex(FORMATO_COR, 'Use uma cor no formato #rrggbb')])
      .nullish()
      .transform((v) => (v ? v.toLowerCase() : null)),
    cargaMaxima: inteiro(1, 60, 'A carga máxima não pode ser zero'),
    ativo: z.boolean(),
  }),

  async listar(periodoId, id) {
    const consulta = db('professor as p')
      .leftJoin('atribuicao_professor as ap', 'ap.professor_id', 'p.id')
      .leftJoin('atribuicao as a', function () {
        this.on('a.id', 'ap.atribuicao_id')
          .andOn('a.periodo_id', db.raw('?', [periodoId]))
          .andOnNull('a.versao_id')
      })
      .groupBy('p.id', 'p.nome', 'p.siape', 'p.email', 'p.cor', 'p.carga_maxima_semanal', 'p.ativo')
      .orderBy('p.nome')
      .select(
        'p.id',
        'p.nome',
        'p.siape',
        'p.email',
        'p.cor',
        'p.carga_maxima_semanal',
        'p.ativo',
        db.raw('COALESCE(SUM(a.aulas_semanais), 0) AS carga_atribuida'),
        db.raw('COUNT(a.id) AS atribuicoes')
      )
    if (id) consulta.where('p.id', id)
    return (await consulta).map((p) => ({
      id: p.id,
      nome: p.nome,
      siape: p.siape,
      email: p.email,
      // cor: a que aparece nas grades; corEscolhida: só quando definida no cadastro.
      cor: corDoProfessor(p.id, p.cor),
      corEscolhida: p.cor ?? null,
      cargaMaxima: p.carga_maxima_semanal,
      ativo: !!p.ativo,
      cargaAtribuida: Number(p.carga_atribuida),
      atribuicoes: Number(p.atribuicoes),
    }))
  },

  async criar(trx, d) {
    await professorUnico(trx, d)
    const [id] = await trx('professor').insert({
      nome: d.nome,
      siape: d.siape,
      email: d.email,
      cor: d.cor,
      carga_maxima_semanal: d.cargaMaxima,
      ativo: d.ativo,
    })
    return id
  },

  async atualizar(trx, id, d) {
    const antes = await exigir(trx, 'professor', { id }, 'Professor não encontrado')
    await professorUnico(trx, d, id)
    const campos = {
      nome: d.nome,
      siape: d.siape,
      email: d.email,
      cor: d.cor,
      carga_maxima_semanal: d.cargaMaxima,
      ativo: d.ativo,
    }
    await trx('professor').where({ id }).update(campos)
    // Carga máxima e situação não invalidam aulas já alocadas (F9 é flexível).
    return { alterados: alterados({ ...antes, ativo: !!antes.ativo }, campos), aulasMarcadas: 0 }
  },

  async excluir(trx, id) {
    await exigir(trx, 'professor', { id }, 'Professor não encontrado')
    const vinculos = await contar(trx('atribuicao_professor').where({ professor_id: id }))
    if (vinculos) {
      throw new ErroConflito(
        `O professor está em ${vinculos} atribuição(ões); retire-o delas antes de excluir, ou marque-o como inativo`
      )
    }
    await trx('indisponibilidade').where({ tipo_recurso: 'professor', recurso_id: id }).delete()
    await trx('professor').where({ id }).delete()
  },
}

// ---------- Disciplinas ----------

const esquemaDisciplina = z.object({
  sigla: texto(20),
  nome: texto(150),
  tipoAmbiente: z
    .string()
    .max(40)
    .nullish()
    .transform((v) => tipoAmbiente(v)),
})

const disciplinas = {
  esquema: esquemaDisciplina,
  // No cadastro, a sigla é opcional: sem ela, é gerada pelas iniciais do nome.
  esquemaCriacao: esquemaDisciplina.extend({ sigla: textoOpcional(20) }),

  async criar(trx, d) {
    await disciplinaUnica(trx, d)
    let sigla = d.sigla
    if (!sigla) {
      const usadas = new Set((await trx('disciplina').pluck('sigla')).map(chave))
      const base = siglaDe(d.nome)
      sigla = base
      for (let n = 2; usadas.has(chave(sigla)); n++) sigla = `${base}${n}`
    }
    const [id] = await trx('disciplina').insert({
      sigla,
      nome: d.nome,
      tipo_ambiente: d.tipoAmbiente,
    })
    return id
  },

  async listar(periodoId, id) {
    const consulta = db('disciplina as d')
      .leftJoin('atribuicao as a', function () {
        this.on('a.disciplina_id', 'd.id')
          .andOn('a.periodo_id', db.raw('?', [periodoId]))
          .andOnNull('a.versao_id')
      })
      .groupBy('d.id', 'd.sigla', 'd.nome', 'd.tipo_ambiente')
      .orderBy('d.sigla')
      .select('d.id', 'd.sigla', 'd.nome', 'd.tipo_ambiente', db.raw('COUNT(a.id) AS atribuicoes'))
    if (id) consulta.where('d.id', id)
    return (await consulta).map((d) => ({
      id: d.id,
      sigla: d.sigla,
      nome: d.nome,
      tipoAmbiente: d.tipo_ambiente,
      atribuicoes: Number(d.atribuicoes),
    }))
  },

  async atualizar(trx, id, d) {
    const antes = await exigir(trx, 'disciplina', { id }, 'Disciplina não encontrada')
    await disciplinaUnica(trx, d, id)
    await trx('disciplina')
      .where({ id })
      .update({ sigla: d.sigla, nome: d.nome, tipo_ambiente: d.tipoAmbiente })

    const mudou = alterados(
      { sigla: antes.sigla, nome: antes.nome, tipoAmbiente: antes.tipo_ambiente },
      d
    )
    // Cadastro compartilhado: a mudança vale para as grades de todos os períodos.
    const aulasMarcadas = mudancaAfetaGrade('disciplinas', mudou)
      ? await marcarParaRevisao(trx, { disciplinas: [id] })
      : 0
    return { alterados: mudou, aulasMarcadas }
  },

  async excluir(trx, id) {
    await exigir(trx, 'disciplina', { id }, 'Disciplina não encontrada')
    const usos = await contar(trx('atribuicao').where({ disciplina_id: id }))
    if (usos)
      throw new ErroConflito(`A disciplina está em ${usos} atribuição(ões); exclua-as antes`)
    await trx('disciplina').where({ id }).delete()
  },
}

// ---------- Salas ----------

const esquemaSala = z.object({
  nome: texto(60),
  tipo: z
    .string()
    .max(40)
    .nullish()
    .transform((v) => tipoAmbiente(v)),
  capacidade: inteiro(1, 1000, 'A capacidade deve ser maior que zero'),
  ativa: z.boolean(),
})

const salas = {
  esquema: esquemaSala,
  // No cadastro, a sala nova começa ativa se o formulário não disser o contrário.
  esquemaCriacao: esquemaSala.extend({ ativa: z.boolean().default(true) }),

  async listar(_periodoId, id) {
    const consulta = db('sala').orderBy('nome').select('id', 'nome', 'tipo', 'capacidade', 'ativa')
    if (id) consulta.where({ id })
    return (await consulta).map((s) => ({ ...s, ativa: !!s.ativa }))
  },

  async criar(trx, d) {
    await salaUnica(trx, d)
    const [id] = await trx('sala').insert(d)
    return id
  },

  async atualizar(trx, id, d) {
    const antes = await exigir(trx, 'sala', { id }, 'Sala não encontrada')
    await salaUnica(trx, d, id)
    await trx('sala').where({ id }).update(d)
    const mudou = alterados({ ...antes, ativa: !!antes.ativa }, d)
    const aulasMarcadas = mudancaAfetaGrade('salas', mudou)
      ? await marcarParaRevisao(trx, { salas: [id] })
      : 0
    return { alterados: mudou, aulasMarcadas }
  },

  async excluir(trx, id) {
    await exigir(trx, 'sala', { id }, 'Sala não encontrada')
    const usos = await contar(trx('aula').where({ sala_id: id }))
    if (usos) {
      throw new ErroConflito(
        `A sala está em ${usos} aula(s) de alguma grade; marque-a como inativa em vez de excluir`
      )
    }
    await trx('indisponibilidade').where({ tipo_recurso: 'sala', recurso_id: id }).delete()
    await trx('sala').where({ id }).delete()
  },
}

// ---------- Turmas ----------

const turmas = {
  esquema: z.object({
    codigo: texto(40),
    curso: texto(120),
    nivel: z.enum(['integrado', 'subsequente', 'superior'], {
      error: 'Nível inválido: use integrado, subsequente ou superior',
    }),
    turnos: z
      .array(z.number().int().positive())
      .min(1, 'Escolha ao menos um turno')
      .transform((t) => [...new Set(t)].sort((a, b) => a - b)),
    numeroAlunos: inteiro(0, 1000),
  }),

  async listar(periodoId, id) {
    const aulasPorTurma = db('atribuicao')
      .where({ periodo_id: periodoId })
      .whereNull('versao_id')
      .groupBy('turma_id')
      .select('turma_id', db.raw('SUM(aulas_semanais) AS aulas'))
      .as('s')
    const consulta = db('turma as t')
      .join('curso as c', 'c.id', 't.curso_id')
      .leftJoin(aulasPorTurma, 's.turma_id', 't.id')
      .where('t.periodo_id', periodoId)
      .orderBy('t.codigo')
      .select(
        't.id',
        't.codigo',
        't.turnos_permitidos',
        't.turnos_definidos',
        't.numero_alunos',
        'c.nome as curso',
        'c.nivel',
        's.aulas'
      )
    if (id) consulta.where('t.id', id)

    // Tempos de aula por semana em cada turno, para comparar com a carga da turma.
    const temposPorTurno = new Map(
      (
        await db('horario')
          .where({ periodo_id: periodoId })
          .groupBy('turno_id')
          .select('turno_id', db.raw('COUNT(*) AS n'))
      ).map((r) => [r.turno_id, Number(r.n)])
    )

    return (await consulta).map((t) => {
      const ids = json(t.turnos_permitidos) ?? []
      return {
        id: t.id,
        codigo: t.codigo,
        curso: t.curso,
        nivel: t.nivel,
        turnos: ids,
        turnosDefinidos: !!t.turnos_definidos,
        numeroAlunos: t.numero_alunos,
        aulasSemanais: Number(t.aulas ?? 0),
        temposDisponiveis: ids.reduce((s, tid) => s + (temposPorTurno.get(tid) ?? 0), 0),
      }
    })
  },

  // A turma é do semestre (período): vale para todos os horários dele.
  async criar(trx, d, periodoId) {
    await validarTurma(trx, d, periodoId)
    const [id] = await trx('turma').insert({
      periodo_id: periodoId,
      codigo: d.codigo,
      curso_id: await idDoCurso(trx, d),
      turnos_permitidos: JSON.stringify(d.turnos),
      turnos_definidos: true,
      numero_alunos: d.numeroAlunos,
    })
    return id
  },

  async atualizar(trx, id, d, periodoId) {
    const antes = await exigir(
      trx,
      'turma',
      { id, periodo_id: periodoId },
      'Turma não encontrada neste período'
    )
    await validarTurma(trx, d, periodoId, id)
    const curso = { id: await idDoCurso(trx, d) }

    await trx('turma')
      .where({ id })
      .update({
        codigo: d.codigo,
        curso_id: curso.id,
        turnos_permitidos: JSON.stringify(d.turnos),
        // Salvar a turma em Dados confirma o turno (pendência da planilha de oferta).
        turnos_definidos: true,
        numero_alunos: d.numeroAlunos,
      })

    const cursoAntes = await trx('curso').where({ id: antes.curso_id }).first()
    const turnosAntes = [...(json(antes.turnos_permitidos) ?? [])].sort((a, b) => a - b)
    const mudou = alterados(
      {
        codigo: antes.codigo,
        curso: cursoAntes?.nome,
        nivel: cursoAntes?.nivel,
        turnos: turnosAntes,
        numeroAlunos: antes.numero_alunos,
      },
      d
    )
    // Só as aulas que a mudança deixa fora do lugar: num turno retirado ou numa sala
    // que deixou de comportar a turma. Acrescentar turno não marca nada.
    const afetadas = mudancaAfetaGrade('turmas', mudou)
      ? await aulasAfetadasPelaTurma(trx, {
          periodoId,
          turmaId: id,
          antes: { turnos: turnosAntes, numeroAlunos: antes.numero_alunos },
          depois: d,
        })
      : []
    const aulasMarcadas = await marcarAulas(
      trx,
      afetadas.map((a) => a.id)
    )
    return { alterados: mudou, aulasMarcadas }
  },

  async excluir(trx, id, periodoId) {
    await exigir(trx, 'turma', { id, periodo_id: periodoId }, 'Turma não encontrada neste período')
    const aulas = await contar(
      trx('aula as a').join('atribuicao as at', 'at.id', 'a.atribuicao_id').where('at.turma_id', id)
    )
    if (aulas)
      throw new ErroConflito(`A turma tem ${aulas} aula(s) alocada(s) em alguma versão da grade`)
    await trx('indisponibilidade').where({ tipo_recurso: 'turma', recurso_id: id }).delete()
    await trx('turma').where({ id }).delete() // atribuições saem em cascata
  },
}

// ---------- Atribuições ----------

const atribuicoes = {
  esquema: z
    .object({
      professores: z
        .array(z.number().int().positive())
        .min(1, 'Escolha ao menos um professor')
        .transform((p) => [...new Set(p)].sort((a, b) => a - b)),
      aulasSemanais: inteiro(1, 40, 'Informe ao menos uma aula semanal'),
      tamanhoBloco: inteiro(1, 6, 'O bloco tem ao menos uma aula'),
      grupoParalelo: textoOpcional(40),
    })
    .superRefine((d, ctx) => {
      if (d.tamanhoBloco > d.aulasSemanais) {
        ctx.addIssue({
          code: 'custom',
          path: ['tamanhoBloco'],
          message: 'O bloco não pode ser maior que as aulas semanais',
        })
      }
    }),

  async listar(periodoId, id, versaoId = null) {
    const consulta = db('atribuicao as a')
      .join('turma as t', 't.id', 'a.turma_id')
      .join('disciplina as d', 'd.id', 'a.disciplina_id')
      .where('a.periodo_id', periodoId)
      .modify(doEscopo(versaoId))
      .orderBy(['t.codigo', 'd.sigla'])
      .select(
        'a.id',
        'a.turma_id',
        't.codigo as turma',
        'a.disciplina_id',
        'd.sigla as disciplina',
        'd.nome as disciplina_nome',
        'a.aulas_semanais',
        'a.tamanho_bloco',
        'a.grupo_paralelo'
      )
    if (id) consulta.where('a.id', id)
    const linhas = await consulta

    const vinculos = await db('atribuicao_professor as ap')
      .join('professor as p', 'p.id', 'ap.professor_id')
      .whereIn(
        'ap.atribuicao_id',
        linhas.map((l) => l.id)
      )
      .orderBy('p.nome')
      .select('ap.atribuicao_id', 'p.id', 'p.nome', 'p.siape', 'p.cor')
    const porAtribuicao = new Map()
    for (const v of vinculos) {
      if (!porAtribuicao.has(v.atribuicao_id)) porAtribuicao.set(v.atribuicao_id, [])
      porAtribuicao.get(v.atribuicao_id).push({
        id: v.id,
        nome: v.nome,
        siape: v.siape,
        cor: corDoProfessor(v.id, v.cor),
      })
    }

    return linhas.map((a) => ({
      id: a.id,
      turmaId: a.turma_id,
      turma: a.turma,
      disciplinaId: a.disciplina_id,
      disciplina: a.disciplina,
      disciplinaNome: a.disciplina_nome,
      professores: (porAtribuicao.get(a.id) ?? []).map((p) => p.id).sort((x, y) => x - y),
      professoresDetalhe: porAtribuicao.get(a.id) ?? [],
      aulasSemanais: a.aulas_semanais,
      tamanhoBloco: a.tamanho_bloco,
      grupoParalelo: a.grupo_paralelo,
    }))
  },

  async atualizar(trx, id, d, periodoId, versaoId = null) {
    const antes = await exigir(
      trx,
      'atribuicao',
      { id, periodo_id: periodoId, versao_id: versaoId },
      versaoId
        ? 'Atribuição não encontrada neste horário'
        : 'Atribuição não encontrada neste período'
    )
    const existentes = await trx('professor').whereIn('id', d.professores).pluck('id')
    if (existentes.length !== d.professores.length) {
      throw new ErroValidacao([
        { campo: 'professores', mensagem: 'Há professor inexistente na lista' },
      ])
    }
    const professoresAntes = (
      await trx('atribuicao_professor').where({ atribuicao_id: id }).pluck('professor_id')
    ).sort((a, b) => a - b)

    await trx('atribuicao').where({ id }).update({
      aulas_semanais: d.aulasSemanais,
      tamanho_bloco: d.tamanhoBloco,
      grupo_paralelo: d.grupoParalelo,
    })
    await trx('atribuicao_professor').where({ atribuicao_id: id }).delete()
    await trx('atribuicao_professor').insert(
      d.professores.map((p) => ({ atribuicao_id: id, professor_id: p }))
    )

    const mudou = alterados(
      {
        professores: professoresAntes,
        aulasSemanais: antes.aulas_semanais,
        tamanhoBloco: antes.tamanho_bloco,
        grupoParalelo: antes.grupo_paralelo,
      },
      d
    )
    const aulasMarcadas = mudancaAfetaGrade('atribuicoes', mudou)
      ? await marcarParaRevisao(trx, { periodoId, atribuicoes: [id] })
      : 0
    return { alterados: mudou, aulasMarcadas }
  },

  // Na oferta, nada aponta para a atribuição (os horários têm cópias). No horário,
  // excluir tira a disciplina dele junto com as aulas; quem chama confirma antes.
  async excluir(trx, id, periodoId, versaoId = null) {
    await exigir(
      trx,
      'atribuicao',
      { id, periodo_id: periodoId, versao_id: versaoId },
      versaoId
        ? 'Atribuição não encontrada neste horário'
        : 'Atribuição não encontrada neste período'
    )
    const aulas = await contar(trx('aula').where({ atribuicao_id: id }))
    await trx('atribuicao').where({ id }).delete()
    return { aulasRemovidas: aulas }
  },
}

// Nome único (sem diferenciar acento e maiúscula): a planilha reconhece a sala pelo nome.
async function salaUnica(trx, d, idAtual = null) {
  const outra = (await trx('sala').select('id', 'nome')).find(
    (x) => x.id !== idAtual && chave(x.nome) === chave(d.nome)
  )
  if (outra) {
    throw new ErroConflito(`Já existe a sala ${outra.nome}`, [
      { campo: 'nome', mensagem: 'Já existe sala com este nome' },
    ])
  }
}

// Sigla e nome únicos (sem diferenciar acento e maiúscula): a planilha de oferta
// reconhece a disciplina pelo nome.
async function disciplinaUnica(trx, d, idAtual = null) {
  const outras = (await trx('disciplina').select('id', 'sigla', 'nome')).filter(
    (x) => x.id !== idAtual
  )
  const mesmaSigla = d.sigla && outras.find((x) => chave(x.sigla) === chave(d.sigla))
  if (mesmaSigla) {
    throw new ErroConflito(`Já existe disciplina com a sigla ${mesmaSigla.sigla}`, [
      { campo: 'sigla', mensagem: 'Já existe disciplina com esta sigla' },
    ])
  }
  const mesmoNome = outras.find((x) => chave(x.nome) === chave(d.nome))
  if (mesmoNome) {
    throw new ErroConflito(`Já existe a disciplina ${mesmoNome.nome} (${mesmoNome.sigla})`, [
      { campo: 'nome', mensagem: 'Já existe disciplina com este nome' },
    ])
  }
}

async function validarTurma(trx, d, periodoId, idAtual = null) {
  const validos = await trx('turno')
    .where({ periodo_id: periodoId })
    .whereIn('id', d.turnos)
    .pluck('id')
  if (validos.length !== d.turnos.length) {
    throw new ErroValidacao([
      { campo: 'turnos', mensagem: 'Há turno que não pertence a este período' },
    ])
  }
  const outra = await trx('turma')
    .where({ periodo_id: periodoId, codigo: d.codigo })
    .whereNot({ id: idAtual ?? 0 })
    .first('id')
  if (outra) {
    throw new ErroConflito(`Já existe a turma ${d.codigo} neste período`, [
      { campo: 'codigo', mensagem: 'Já existe turma com este código no período' },
    ])
  }
}

async function idDoCurso(trx, d) {
  const curso = await trx('curso').where({ nome: d.curso, nivel: d.nivel }).first('id')
  if (curso) return curso.id
  const [id] = await trx('curso').insert({ nome: d.curso, nivel: d.nivel })
  return id
}

// Nome repetido confundiria a planilha de oferta, que reconhece o professor pelo nome.
async function professorUnico(trx, d, idAtual = null) {
  if (d.siape) {
    await garantirUnico(
      trx,
      'professor',
      { siape: d.siape },
      idAtual ?? 0,
      `Já existe professor com o SIAPE ${d.siape}`
    )
  }
  const mesmoNome = (await trx('professor').select('id', 'nome')).find(
    (p) => p.id !== idAtual && chave(p.nome) === chave(d.nome)
  )
  if (mesmoNome) {
    throw new ErroConflito(`Já existe professor chamado ${mesmoNome.nome}`, [
      { campo: 'nome', mensagem: 'Já existe professor com este nome' },
    ])
  }
}

// ---------- Interface comum ----------

function doEscopo(versaoId) {
  return (q) => (versaoId ? q.where('a.versao_id', versaoId) : q.whereNull('a.versao_id'))
}

// As mesmas regras de atribuição, usadas pelos horários (servicos/horarios.js).
export const regrasDeAtribuicao = atribuicoes

export const ENTIDADES = { professores, turmas, disciplinas, atribuicoes, salas }
export const NOMES_ENTIDADES = Object.keys(ENTIDADES)

async function exigirPeriodo(periodoId) {
  await exigir(db, 'periodo_letivo', { id: periodoId }, 'Período letivo não encontrado')
}

export async function listar(entidade, periodoId) {
  await exigirPeriodo(periodoId)
  return ENTIDADES[entidade].listar(periodoId)
}

export async function atualizar(entidade, periodoId, id, corpo) {
  await exigirPeriodo(periodoId)
  const def = ENTIDADES[entidade]
  const dados = def.esquema.parse(corpo)
  const resultado = await db.transaction((trx) => def.atualizar(trx, id, dados, periodoId))
  const [registro] = await def.listar(periodoId, id)
  return { registro, ...resultado }
}

// Cadastro manual: só os tipos que têm "criar" (professores, disciplinas, salas e turmas).
export async function criar(entidade, periodoId, corpo) {
  await exigirPeriodo(periodoId)
  const def = ENTIDADES[entidade]
  if (!def.criar) {
    throw new ErroValidacao([], 'Este cadastro entra pela importação da planilha de oferta')
  }
  const dados = (def.esquemaCriacao ?? def.esquema).parse(corpo)
  const id = await db.transaction((trx) => def.criar(trx, dados, periodoId))
  const [registro] = await def.listar(periodoId, id)
  return { registro }
}

export async function excluir(entidade, periodoId, id) {
  await exigirPeriodo(periodoId)
  await db.transaction((trx) => ENTIDADES[entidade].excluir(trx, id, periodoId))
}
