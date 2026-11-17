// F1-19 — Impacto na grade: aulas já alocadas cujos dados mudam (reimportação ou
// correção manual). Essas aulas não são apagadas; são marcadas com aula.revisar = true.

// Campos que, ao mudar, podem invalidar uma aula já alocada (R4, R5, R7...).
export const CAMPOS_COM_IMPACTO = {
  atribuicoes: null, // qualquer mudança
  turmas: ['turnos', 'numeroAlunos'],
  disciplinas: ['tipoAmbiente'],
  salas: ['tipo', 'capacidade', 'ativa'],
}

const COLUNA_DO_TIPO = {
  atribuicoes: 'atribuicao_id',
  turmas: 'turma_id',
  disciplinas: 'disciplina_id',
  salas: 'sala_id',
}

// Aulas ligadas a qualquer um dos ids informados. Sem periodoId, considera todos
// os períodos (salas e disciplinas são cadastros compartilhados).
export async function buscarAulasAfetadas(
  trx,
  { periodoId = null, atribuicoes = [], turmas = [], disciplinas = [], salas = [] }
) {
  if (!atribuicoes.length && !turmas.length && !disciplinas.length && !salas.length) return []

  const consulta = trx('aula as a')
    .join('versao_grade as v', 'v.id', 'a.versao_id')
    .join('atribuicao as at', 'at.id', 'a.atribuicao_id')
    .andWhere((q) => {
      q.whereIn('a.atribuicao_id', atribuicoes)
        .orWhereIn('at.turma_id', turmas)
        .orWhereIn('at.disciplina_id', disciplinas)
        .orWhereIn('a.sala_id', salas)
    })
    .select(
      'a.id',
      'a.versao_id',
      'a.atribuicao_id',
      'at.turma_id',
      'at.disciplina_id',
      'a.sala_id'
    )
  if (periodoId) consulta.where('v.periodo_id', periodoId)
  return consulta
}

// Marca as aulas afetadas e devolve quantas foram marcadas.
export async function marcarParaRevisao(trx, filtros) {
  const aulas = await buscarAulasAfetadas(trx, filtros)
  if (aulas.length)
    await trx('aula')
      .whereIn(
        'id',
        aulas.map((a) => a.id)
      )
      .update({ revisar: true })
  return aulas.length
}

// Diz se a mudança de um registro do tipo informado afeta a grade.
export function mudancaAfetaGrade(tipo, camposAlterados) {
  const campos = CAMPOS_COM_IMPACTO[tipo]
  if (campos === undefined) return false
  return campos === null
    ? camposAlterados.length > 0
    : camposAlterados.some((c) => campos.includes(c))
}

function linhasComImpacto(arquivo) {
  return arquivo.linhas.filter(
    (l) =>
      l.situacao === 'atualizar' &&
      l.registro?.id &&
      mudancaAfetaGrade(
        arquivo.tipo,
        l.mudancas.map((m) => m.chaveCampo)
      )
  )
}

// Importação: anota em cada linha afetada quantas aulas serão marcadas e devolve os ids.
export async function calcularImpacto(trx, periodoId, arquivos) {
  const alvos = arquivos.flatMap((arquivo) =>
    linhasComImpacto(arquivo).map((linha) => ({ linha, coluna: COLUNA_DO_TIPO[arquivo.tipo] }))
  )
  if (!alvos.length) return { aulas: [], versoes: 0 }

  const ids = (coluna) => alvos.filter((a) => a.coluna === coluna).map((a) => a.linha.registro.id)
  const aulas = await buscarAulasAfetadas(trx, {
    periodoId,
    atribuicoes: ids('atribuicao_id'),
    turmas: ids('turma_id'),
    disciplinas: ids('disciplina_id'),
    salas: ids('sala_id'),
  })

  for (const { linha, coluna } of alvos) {
    const afetadas = aulas.filter((a) => a[coluna] === linha.registro.id)
    if (afetadas.length) linha.aulasParaRevisar = afetadas.length
  }

  return {
    aulas: aulas.map((a) => a.id),
    versoes: new Set(aulas.map((a) => a.versao_id)).size,
  }
}
