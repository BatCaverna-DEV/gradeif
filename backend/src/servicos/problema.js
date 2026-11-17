// F2-16 — Montador do problema: exporta os dados de um período para o JSON do
// núcleo (src/core/problema.js). É a única ponte entre banco e solver.
//
// Professores e salas inativos ficam de fora. Uma atribuição cujos professores
// estão todos inativos também fica de fora; cada exclusão vira um aviso.
// Com incluirInativos (avaliação de uma versão já gravada), entra tudo: a versão
// pode ter aulas de professores e salas que foram desativados depois.
//
// Atribuições: com versaoId, as do horário (cada horário tem as suas); sem ele, as
// da oferta do período. incluirFixadas leva as aulas fixadas do horário como dado
// (regeração parcial); a avaliação não precisa delas.

import { db } from '../db/knex.js'
import { ErroNaoEncontrado, ErroValidacao } from '../erros.js'

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : (v ?? null))
const hora = (v) => (v ? String(v).slice(0, 5) : undefined)

export async function montarProblema(
  periodoId,
  { versaoId = null, opcoes = {}, incluirInativos = false, incluirFixadas = !!versaoId } = {}
) {
  const periodo = await db('periodo_letivo').where({ id: periodoId }).first()
  if (!periodo) throw new ErroNaoEncontrado('Período letivo não encontrado')
  if (versaoId) {
    const versao = await db('versao_grade').where({ id: versaoId, periodo_id: periodoId }).first()
    if (!versao) throw new ErroNaoEncontrado('Horário não encontrado neste período')
  }
  const doEscopo = (coluna) => (q) => (versaoId ? q.where(coluna, versaoId) : q.whereNull(coluna))
  const avisos = []

  const turnos = await db('turno').where({ periodo_id: periodoId }).orderBy('ordem')
  const horarios = await db('horario')
    .where({ periodo_id: periodoId })
    .orderBy(['dia_semana', 'turno_id', 'ordem'])
  const turmas = await db('turma').where({ periodo_id: periodoId }).orderBy('codigo')

  const atribuicoes = await db('atribuicao as a')
    .modify(doEscopo('a.versao_id'))
    .join('turma as t', 't.id', 'a.turma_id')
    .join('disciplina as d', 'd.id', 'a.disciplina_id')
    .where('a.periodo_id', periodoId)
    .select(
      'a.id',
      'a.turma_id',
      'a.disciplina_id',
      'a.aulas_semanais',
      'a.tamanho_bloco',
      'a.grupo_paralelo',
      't.codigo as turma',
      'd.sigla',
      'd.tipo_ambiente'
    )
    .orderBy(['t.codigo', 'd.sigla'])
  const vinculos = await db('atribuicao_professor as ap')
    .join('atribuicao as a', 'a.id', 'ap.atribuicao_id')
    .join('professor as p', 'p.id', 'ap.professor_id')
    .where('a.periodo_id', periodoId)
    .modify(doEscopo('a.versao_id'))
    .select('ap.atribuicao_id', 'p.id', 'p.nome', 'p.carga_maxima_semanal', 'p.ativo')

  const professores = new Map()
  const profsDaAtribuicao = new Map()
  for (const v of vinculos) {
    if (!v.ativo && !incluirInativos) continue
    professores.set(v.id, {
      id: v.id,
      nome: v.nome,
      cargaMaximaSemanal: v.carga_maxima_semanal,
    })
    if (!profsDaAtribuicao.has(v.atribuicao_id)) profsDaAtribuicao.set(v.atribuicao_id, [])
    profsDaAtribuicao.get(v.atribuicao_id).push(v.id)
  }
  const inativos = new Map()
  for (const v of vinculos) if (!v.ativo && !incluirInativos) inativos.set(v.id, v.nome)
  for (const nome of new Set(inativos.values()))
    avisos.push(`Professor inativo fora da geração: ${nome}`)

  const listaAtribuicoes = []
  for (const a of atribuicoes) {
    const rotulo = `${a.turma} · ${a.sigla}`
    const profs = profsDaAtribuicao.get(a.id) ?? []
    if (!profs.length) {
      avisos.push(`Atribuição ${rotulo} fora da geração: nenhum professor ativo`)
      continue
    }
    listaAtribuicoes.push({
      id: a.id,
      turmaId: a.turma_id,
      disciplinaId: a.disciplina_id,
      rotulo,
      tipoAmbiente: a.tipo_ambiente,
      professores: profs,
      aulasSemanais: a.aulas_semanais,
      tamanhoBloco: a.tamanho_bloco,
      grupoParalelo: a.grupo_paralelo ?? null,
    })
  }
  if (!listaAtribuicoes.length) {
    throw new ErroValidacao(
      [],
      versaoId
        ? 'O horário não tem atribuições com professor ativo para gerar a grade'
        : 'O período não tem atribuições com professor ativo para gerar a grade'
    )
  }

  const salas = await db('sala')
    .modify((q) => (incluirInativos ? q : q.where({ ativa: true })))
    .orderBy('nome')
  // Disponibilidade do horário (cada horário tem a sua) ou o padrão do período.
  const indisponibilidades = await db('indisponibilidade')
    .where({ periodo_id: periodoId })
    .modify(doEscopo('versao_id'))
  const restricoes = await db('restricao_config').where({ periodo_id: periodoId })

  // Aulas fixadas do horário (regeração parcial).
  let aulasFixadas = []
  if (versaoId && incluirFixadas) {
    const idsAtribuicoes = new Set(listaAtribuicoes.map((a) => a.id))
    const idsSalas = new Set(salas.map((s) => s.id))
    aulasFixadas = (await db('aula').where({ versao_id: versaoId, fixada: true }))
      .filter((a) => idsAtribuicoes.has(a.atribuicao_id))
      .map((a) => ({
        atribuicaoId: a.atribuicao_id,
        horarioId: a.horario_id,
        salaId: a.sala_id != null && idsSalas.has(a.sala_id) ? a.sala_id : null,
        fixada: true,
      }))
    const totalAulas = listaAtribuicoes.reduce((s, a) => s + a.aulasSemanais, 0)
    if (totalAulas > 0 && aulasFixadas.length >= totalAulas) {
      avisos.push(
        'Todas as aulas deste horário estão fixadas: a geração não tem o que mudar. ' +
          'Desafixe aulas no editor para que o gerador possa reorganizá-las.'
      )
    }
  }

  return {
    problema: {
      turnos: turnos.map((t) => ({ id: t.id, nome: t.nome, ordem: t.ordem })),
      horarios: horarios.map((h) => ({
        id: h.id,
        turnoId: h.turno_id,
        diaSemana: h.dia_semana,
        ordem: h.ordem,
        horaInicio: hora(h.hora_inicio),
        horaFim: hora(h.hora_fim),
      })),
      turmas: turmas.map((t) => ({
        id: t.id,
        codigo: t.codigo,
        turnosPermitidos: json(t.turnos_permitidos) ?? [],
        numeroAlunos: t.numero_alunos,
      })),
      professores: [...professores.values()],
      salas: salas.map((s) => ({ id: s.id, nome: s.nome, tipo: s.tipo, capacidade: s.capacidade })),
      atribuicoes: listaAtribuicoes,
      indisponibilidades: indisponibilidades.map((i) => ({
        tipoRecurso: i.tipo_recurso,
        recursoId: i.recurso_id,
        horarioId: i.horario_id,
        rigida: !!i.rigida,
      })),
      restricoes: restricoes.map((r) => ({
        codigo: r.codigo,
        ativa: !!r.ativa,
        peso: r.peso,
        parametros: json(r.parametros),
      })),
      aulasFixadas,
      opcoes: { semente: String(Date.now()), tempoLimiteMs: 60_000, ...opcoes },
    },
    avisos,
  }
}
