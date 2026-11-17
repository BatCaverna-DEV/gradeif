// F1-14 — Período letivo e grade horária (turnos e tempos de aula).
import { db } from '../db/knex.js'
import { configuracaoInicial } from '../core/restricoes/catalogo.js'
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from '../erros.js'
import { chave } from '../importacao/texto.js'

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : (v ?? null))

function dataIso(valor) {
  if (!valor) return null
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  return String(valor).slice(0, 10)
}

function horaCurta(valor) {
  return valor ? String(valor).slice(0, 5) : null
}

export function paraPeriodo(linha) {
  return {
    id: linha.id,
    nome: linha.nome,
    dataInicio: dataIso(linha.data_inicio),
    dataFim: dataIso(linha.data_fim),
    situacao: linha.situacao,
  }
}

export async function listarPeriodos() {
  const linhas = await db('periodo_letivo').orderBy('nome', 'desc')
  return linhas.map(paraPeriodo)
}

async function buscarLinha(id, trx = db) {
  const linha = await trx('periodo_letivo').where({ id }).first()
  if (!linha) throw new ErroNaoEncontrado('Período letivo não encontrado')
  return linha
}

export async function obterPeriodo(id) {
  const periodo = paraPeriodo(await buscarLinha(id))
  return { ...periodo, ...(await obterGradeHoraria(id)) }
}

export async function criarPeriodo({ nome, dataInicio, dataFim }) {
  return db.transaction(async (trx) => {
    const existente = await trx('periodo_letivo').where({ nome }).first()
    if (existente) throw new ErroConflito(`Já existe o período ${nome}`)

    const [id] = await trx('periodo_letivo').insert({
      nome,
      data_inicio: dataInicio,
      data_fim: dataFim,
    })

    // Pesos iniciais das restrições (descrição, seção 4).
    await trx('restricao_config').insert(
      configuracaoInicial().map((r) => ({
        periodo_id: id,
        codigo: r.codigo,
        ativa: r.ativa,
        peso: r.peso,
        parametros: r.parametros ? JSON.stringify(r.parametros) : null,
      }))
    )

    return paraPeriodo(await buscarLinha(id, trx))
  })
}

export async function atualizarPeriodo(id, dados) {
  await buscarLinha(id)
  const campos = {}
  if (dados.nome !== undefined) campos.nome = dados.nome
  if (dados.dataInicio !== undefined) campos.data_inicio = dados.dataInicio
  if (dados.dataFim !== undefined) campos.data_fim = dados.dataFim
  if (dados.situacao !== undefined) campos.situacao = dados.situacao
  if (Object.keys(campos).length) await db('periodo_letivo').where({ id }).update(campos)
  return paraPeriodo(await buscarLinha(id))
}

export async function excluirPeriodo(id) {
  await buscarLinha(id)
  const versoes = await db('versao_grade').where({ periodo_id: id }).count({ total: '*' }).first()
  if (Number(versoes.total) > 0) {
    throw new ErroConflito('O período já tem versões de grade; exclua-as antes')
  }
  await db('periodo_letivo').where({ id }).delete()
}

export async function obterGradeHoraria(periodoId) {
  const turnos = await db('turno').where({ periodo_id: periodoId }).orderBy('ordem')
  const horarios = await db('horario')
    .where({ periodo_id: periodoId })
    .orderBy(['dia_semana', 'turno_id', 'ordem'])

  const dias = [...new Set(horarios.map((h) => h.dia_semana))].sort((a, b) => a - b)

  return {
    dias,
    turnos: turnos.map((t) => {
      // Os tempos são iguais em todos os dias; usa o primeiro dia como modelo.
      const doTurno = horarios.filter((h) => h.turno_id === t.id && h.dia_semana === dias[0])
      return {
        id: t.id,
        nome: t.nome,
        ordem: t.ordem,
        tempos: doTurno.map((h) => ({
          ordem: h.ordem,
          horaInicio: horaCurta(h.hora_inicio),
          horaFim: horaCurta(h.hora_fim),
        })),
      }
    }),
    horarios: horarios.map((h) => ({
      id: h.id,
      turnoId: h.turno_id,
      diaSemana: h.dia_semana,
      ordem: h.ordem,
      horaInicio: horaCurta(h.hora_inicio),
      horaFim: horaCurta(h.hora_fim),
    })),
  }
}

// Ajusta turnos e horários do período ao que foi enviado, preservando os registros
// que continuam existindo: turmas guardam ids de turno e indisponibilidades guardam
// ids de horário. Turno é reconhecido pelo nome; horário, por turno + dia + ordem.
// Só é permitido enquanto não houver versões de grade, pois as aulas referenciam os horários.
export async function definirGradeHoraria(periodoId, { dias, turnos }) {
  await buscarLinha(periodoId)

  const nomes = turnos.map((t) => chave(t.nome))
  const repetido = nomes.find((n, i) => nomes.indexOf(n) !== i)
  if (repetido !== undefined) {
    throw new ErroValidacao([{ campo: 'turnos', mensagem: 'Há dois turnos com o mesmo nome' }])
  }

  await db.transaction(async (trx) => {
    const versoes = await trx('versao_grade')
      .where({ periodo_id: periodoId })
      .count({ total: '*' })
      .first()
    if (Number(versoes.total) > 0) {
      throw new ErroConflito(
        'Não é possível alterar a grade horária de um período com versões de grade'
      )
    }

    const existentes = await trx('turno').where({ periodo_id: periodoId })
    const porNome = new Map(existentes.map((t) => [chave(t.nome), t]))
    const mantidos = new Set()

    // Turnos removidos não podem estar em uso por turmas do período.
    const removidos = existentes.filter((t) => !nomes.includes(chave(t.nome)))
    if (removidos.length) {
      const turmas = await trx('turma')
        .where({ periodo_id: periodoId })
        .select('codigo', 'turnos_permitidos')
      for (const turno of removidos) {
        const usam = turmas
          .filter((t) => (json(t.turnos_permitidos) ?? []).includes(turno.id))
          .map((t) => t.codigo)
        if (usam.length) {
          throw new ErroConflito(
            `O turno ${turno.nome} é usado pelas turmas ${usam.join(', ')}; ajuste-as antes de removê-lo ou renomeá-lo`
          )
        }
      }
      // Os horários do turno (e as indisponibilidades neles) saem em cascata.
      await trx('turno')
        .whereIn(
          'id',
          removidos.map((t) => t.id)
        )
        .delete()
    }

    for (const [indice, turno] of turnos.entries()) {
      const ordem = turno.ordem ?? indice + 1
      let turnoId = porNome.get(chave(turno.nome))?.id
      if (turnoId) await trx('turno').where({ id: turnoId }).update({ nome: turno.nome, ordem })
      else [turnoId] = await trx('turno').insert({ periodo_id: periodoId, nome: turno.nome, ordem })
      mantidos.add(turnoId)

      const atuais = new Map(
        (await trx('horario').where({ turno_id: turnoId })).map((h) => [
          `${h.dia_semana}|${h.ordem}`,
          h,
        ])
      )
      const desejados = new Set()
      const novos = []
      for (const dia of dias) {
        for (const [i, tempo] of turno.tempos.entries()) {
          const k = `${dia}|${i + 1}`
          desejados.add(k)
          const atual = atuais.get(k)
          const horas = { hora_inicio: tempo.horaInicio, hora_fim: tempo.horaFim }
          if (!atual)
            novos.push({
              periodo_id: periodoId,
              turno_id: turnoId,
              dia_semana: dia,
              ordem: i + 1,
              ...horas,
            })
          else if (
            horaCurta(atual.hora_inicio) !== tempo.horaInicio ||
            horaCurta(atual.hora_fim) !== tempo.horaFim
          ) {
            await trx('horario').where({ id: atual.id }).update(horas)
          }
        }
      }
      const sobrando = [...atuais].filter(([k]) => !desejados.has(k)).map(([, h]) => h.id)
      if (sobrando.length) await trx('horario').whereIn('id', sobrando).delete()
      if (novos.length) await trx('horario').insert(novos)
    }
  })

  return obterGradeHoraria(periodoId)
}
