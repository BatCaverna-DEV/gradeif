// Estado atual dos cadastros, indexado pelas chaves de identificação da importação.
// A prévia consulta este contexto e acrescenta nele as linhas válidas de cada
// arquivo, para que arquivos posteriores do mesmo envio enxerguem os registros
// que ainda vão ser criados (ex.: atribuições que citam turmas novas).
import { chave, tipoAmbiente } from './texto.js'

function json(valor) {
  if (valor === null || valor === undefined) return null
  return typeof valor === 'string' ? JSON.parse(valor) : valor
}

export async function carregarContexto(trx, periodoId) {
  const [salas, professores, disciplinas, cursos, turnos, turmas, atribuicoes, vinculos] =
    await Promise.all([
      trx('sala').select('id', 'nome', 'tipo', 'capacidade'),
      trx('professor').select('id', 'nome', 'siape', 'email', 'carga_maxima_semanal'),
      trx('disciplina').select('id', 'sigla', 'nome', 'tipo_ambiente'),
      trx('curso').select('id', 'nome', 'nivel'),
      trx('turno').where({ periodo_id: periodoId }).orderBy('ordem').select('id', 'nome'),
      trx('turma as t')
        .join('curso as c', 'c.id', 't.curso_id')
        .where('t.periodo_id', periodoId)
        .select(
          't.id',
          't.codigo',
          't.turnos_permitidos',
          't.numero_alunos',
          'c.nome as curso',
          'c.nivel'
        ),
      trx('atribuicao as a')
        .join('turma as t', 't.id', 'a.turma_id')
        .join('disciplina as d', 'd.id', 'a.disciplina_id')
        .where('a.periodo_id', periodoId)
        .whereNull('a.versao_id')
        .select(
          'a.id',
          't.id as turma_id',
          't.codigo as turma',
          'd.id as disciplina_id',
          'd.sigla as disciplina',
          'a.aulas_semanais',
          'a.tamanho_bloco',
          'a.grupo_paralelo'
        ),
      trx('atribuicao_professor as ap')
        .join('atribuicao as a', 'a.id', 'ap.atribuicao_id')
        .join('professor as p', 'p.id', 'ap.professor_id')
        .where('a.periodo_id', periodoId)
        .whereNull('a.versao_id')
        .select('ap.atribuicao_id', 'p.siape', 'p.id as professor_id'),
    ])

  const ctx = {
    salas: new Map(),
    professores: new Map(),
    professoresPorNome: new Map(),
    disciplinas: new Map(),
    cursos: new Map(),
    turnos: turnos.map((t) => ({ id: t.id, nome: t.nome, chave: chave(t.nome) })),
    turmas: new Map(),
    atribuicoes: new Map(),
  }

  for (const s of salas) {
    ctx.salas.set(chave(s.nome), { id: s.id, nome: s.nome, tipo: s.tipo, capacidade: s.capacidade })
  }
  for (const p of professores) {
    adicionarProfessor(ctx, {
      id: p.id,
      nome: p.nome,
      siape: p.siape,
      email: p.email ?? null,
      cargaMaxima: p.carga_maxima_semanal,
    })
  }
  for (const d of disciplinas) {
    ctx.disciplinas.set(chave(d.sigla), {
      id: d.id,
      sigla: d.sigla,
      nome: d.nome,
      tipoAmbiente: tipoAmbiente(d.tipo_ambiente),
    })
  }
  for (const c of cursos)
    ctx.cursos.set(chaveCurso(c.nome, c.nivel), { id: c.id, nome: c.nome, nivel: c.nivel })
  for (const t of turmas) {
    ctx.turmas.set(chave(t.codigo), {
      id: t.id,
      codigo: t.codigo,
      curso: t.curso,
      nivel: t.nivel,
      turnos: [...(json(t.turnos_permitidos) ?? [])].sort((a, b) => a - b),
      numeroAlunos: t.numero_alunos,
    })
  }

  const siapesPorAtribuicao = new Map()
  for (const v of vinculos) {
    if (!siapesPorAtribuicao.has(v.atribuicao_id)) siapesPorAtribuicao.set(v.atribuicao_id, [])
    siapesPorAtribuicao.get(v.atribuicao_id).push(v.siape ?? `id:${v.professor_id}`)
  }
  for (const a of atribuicoes) {
    ctx.atribuicoes.set(chaveAtribuicao(a.turma, a.disciplina), {
      id: a.id,
      turmaId: a.turma_id,
      disciplinaId: a.disciplina_id,
      turma: a.turma,
      disciplina: a.disciplina,
      aulasSemanais: a.aulas_semanais,
      tamanhoBloco: a.tamanho_bloco,
      grupoParalelo: a.grupo_paralelo ?? null,
      professores: (siapesPorAtribuicao.get(a.id) ?? []).sort(),
    })
  }

  return ctx
}

export function chaveCurso(nome, nivel) {
  return `${chave(nome)}|${nivel}`
}

export function chaveAtribuicao(turma, disciplina) {
  return `${chave(turma)}|${chave(disciplina)}`
}

// Professor é indexado pelo SIAPE; quem veio da planilha de oferta pode não ter
// SIAPE e é indexado por "id:<id>".
export const refProfessor = (p) => p.siape ?? `id:${p.id}`

export function adicionarProfessor(ctx, professor) {
  const ref = refProfessor(professor)
  ctx.professores.set(ref, professor)
  const porNome = chave(professor.nome)
  if (!ctx.professoresPorNome.has(porNome)) ctx.professoresPorNome.set(porNome, new Set())
  ctx.professoresPorNome.get(porNome).add(ref)
}
