// F3-11 — Painel do período: situação dos dados, pendências e versões.
// As pendências usam as mesmas regras do núcleo (a instância do problema), para
// o painel apontar antes da geração o que o solver não vai conseguir cumprir.

import { db } from '../db/knex.js'
import { criarInstancia } from '../core/index.js'
import { ErroNaoEncontrado } from '../erros.js'
import { gerenciador } from '../geracao/gerenciador.js'
import { listar } from './dados.js'
import { montarProblema } from './problema.js'
import { listarVersoes } from './versoes.js'

const LIMITE_POR_TIPO = 5

// Junta itens repetidos numa só pendência: "A, B, C e mais 4".
function resumir(nomes) {
  if (nomes.length <= LIMITE_POR_TIPO) return nomes.join(', ')
  return `${nomes.slice(0, LIMITE_POR_TIPO).join(', ')} e mais ${nomes.length - LIMITE_POR_TIPO}`
}

export async function painelDoPeriodo(periodoId) {
  const periodo = await db('periodo_letivo').where({ id: periodoId }).first()
  if (!periodo) throw new ErroNaoEncontrado('Período letivo não encontrado')

  const [turnos, horarios, professores, turmas, disciplinas, atribuicoes, salas] =
    await Promise.all([
      db('turno').where({ periodo_id: periodoId }).count({ n: '*' }).first(),
      db('horario').where({ periodo_id: periodoId }).count({ n: '*' }).first(),
      listar('professores', periodoId),
      listar('turmas', periodoId),
      listar('disciplinas', periodoId),
      listar('atribuicoes', periodoId),
      listar('salas', periodoId),
    ])
  const ultimaImportacao = await db('importacao')
    .where({ periodo_id: periodoId })
    .orderBy('id', 'desc')
    .first()

  const pendencias = []
  const pendencia = (nivel, mensagem, rota = null) => pendencias.push({ nivel, mensagem, rota })

  if (!Number(horarios.n))
    pendencia('erro', 'Defina os turnos e os tempos de aula.', 'grade-horaria')
  if (!turmas.length || !atribuicoes.length)
    pendencia('erro', 'Importe turmas e atribuições.', 'importacao')

  const professoresDoPeriodo = professores.filter((p) => p.atribuicoes > 0)
  const acima = professoresDoPeriodo.filter((p) => p.cargaAtribuida > p.cargaMaxima)
  if (acima.length)
    pendencia(
      'aviso',
      `Professores com aulas acima da carga máxima: ${resumir(acima.map((p) => `${p.nome} (${p.cargaAtribuida}/${p.cargaMaxima})`))}.`,
      'dados'
    )
  const inativos = professoresDoPeriodo.filter((p) => !p.ativo)
  if (inativos.length)
    pendencia(
      'aviso',
      `Professores inativos com atribuições (ficam fora da geração): ${resumir(inativos.map((p) => p.nome))}.`,
      'dados'
    )
  // Turmas criadas pela planilha de oferta sem a coluna Turno: ficaram com todos os turnos.
  const semTurno = turmas.filter((t) => !t.turnosDefinidos)
  if (semTurno.length)
    pendencia(
      'erro',
      `Defina o turno das turmas importadas (hoje permitem todos os turnos): ${resumir(semTurno.map((t) => t.codigo))}.`,
      'dados'
    )
  const naoCabem = turmas.filter((t) => t.aulasSemanais > t.temposDisponiveis)
  if (naoCabem.length)
    pendencia(
      'erro',
      `Turmas com mais aulas que tempos nos turnos: ${resumir(naoCabem.map((t) => `${t.codigo} (${t.aulasSemanais}/${t.temposDisponiveis})`))}.`,
      'dados'
    )
  if (!salas.some((s) => s.ativa))
    pendencia('aviso', 'Nenhuma sala ativa: a grade sai sem salas.', 'importacao')

  // Regras do núcleo: salas compatíveis e consistência dos dados.
  if (atribuicoes.length && Number(horarios.n)) {
    try {
      const { problema, avisos } = await montarProblema(periodoId)
      const inst = criarInstancia(problema)
      const semSala = []
      for (let a = 0; a < inst.A; a++) {
        if (inst.atrSemSalaCompativel[a])
          semSala.push(
            `${inst.rotuloAtribuicao(a)} (${inst.atrTipo[a]}, ${inst.atrCapacidade[a]} alunos)`
          )
      }
      if (semSala.length)
        pendencia(
          'erro',
          `Atribuições sem sala compatível em tipo e capacidade: ${resumir(semSala)}. Divida a turma em grupos paralelos ou ajuste as salas.`,
          'dados'
        )
      for (const a of avisos.filter((x) => x.startsWith('Atribuição')))
        pendencia('aviso', `${a}.`, 'dados')
    } catch (erro) {
      pendencia('erro', erro.message, 'dados')
    }
  }

  const versoes = await listarVersoes(periodoId)
  return {
    dados: {
      turnos: Number(turnos.n),
      horarios: Number(horarios.n),
      turmas: turmas.length,
      professores: professoresDoPeriodo.length,
      disciplinas: disciplinas.filter((d) => d.atribuicoes > 0).length,
      atribuicoes: atribuicoes.length,
      aulasSemanais: atribuicoes.reduce((s, a) => s + a.aulasSemanais, 0),
      salasAtivas: salas.filter((s) => s.ativa).length,
      ultimaImportacao: ultimaImportacao?.criado_em ?? null,
    },
    pendencias,
    versoes: {
      total: versoes.length,
      publicada: versoes.find((v) => v.publicada) ?? null,
      recentes: versoes.slice(0, 5),
    },
    geracao: gerenciador.obter(periodoId),
  }
}
