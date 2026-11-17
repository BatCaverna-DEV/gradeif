// F1-18 — Gravação de um envio confirmado, tudo em uma transação.
// A prévia é refeita dentro da transação: se algo mudou desde que o usuário viu a
// prévia e surgiu linha rejeitada, nada é gravado.
import { db } from '../db/knex.js'
import { ErroConflito, ErroValidacao } from '../erros.js'
import { gerarPrevia } from './previa.js'
import { SITUACAO } from './classificacao.js'
import { gravarNoHorario, gravarOferta } from './oferta.js'

async function idDoCurso(trx, nome, nivel) {
  const existente = await trx('curso').where({ nome, nivel }).first('id')
  if (existente) return existente.id
  const [id] = await trx('curso').insert({ nome, nivel })
  return id
}

const gravadores = {
  async salas(trx, r) {
    const campos = { nome: r.nome, tipo: r.tipo, capacidade: r.capacidade }
    if (r.id) await trx('sala').where({ id: r.id }).update(campos)
    else await trx('sala').insert(campos)
  },

  async professores(trx, r) {
    const campos = {
      nome: r.nome,
      siape: r.siape,
      email: r.email,
      carga_maxima_semanal: r.cargaMaxima,
    }
    if (r.id) await trx('professor').where({ id: r.id }).update(campos)
    else await trx('professor').insert(campos)
  },

  async disciplinas(trx, r) {
    const campos = { sigla: r.sigla, nome: r.nome, tipo_ambiente: r.tipoAmbiente }
    if (r.id) await trx('disciplina').where({ id: r.id }).update(campos)
    else await trx('disciplina').insert(campos)
  },

  async turmas(trx, r, periodoId) {
    const campos = {
      curso_id: await idDoCurso(trx, r.curso, r.nivel),
      turnos_permitidos: JSON.stringify(r.turnos),
      numero_alunos: r.numeroAlunos,
    }
    if (r.id) await trx('turma').where({ id: r.id }).update(campos)
    else await trx('turma').insert({ ...campos, periodo_id: periodoId, codigo: r.codigo })
  },

  async atribuicoes(trx, r, periodoId) {
    // Turma e disciplina podem ter sido criadas neste mesmo envio: busca pela chave.
    const turmaId =
      r.turmaId ??
      (await trx('turma').where({ periodo_id: periodoId, codigo: r.turma }).first('id'))?.id
    const disciplinaId =
      r.disciplinaId ?? (await trx('disciplina').where({ sigla: r.disciplina }).first('id'))?.id
    const refsPorId = r.professores
      .filter((p) => p.startsWith('id:'))
      .map((p) => Number(p.slice(3)))
    const siapes = r.professores.filter((p) => !p.startsWith('id:'))
    const professores = await trx('professor')
      .where((q) => q.whereIn('siape', siapes).orWhereIn('id', refsPorId))
      .select('id')
    if (!turmaId || !disciplinaId || professores.length !== r.professores.length) {
      throw new ErroConflito(
        `Referência não encontrada ao gravar a atribuição ${r.turma} · ${r.disciplina}`
      )
    }

    const campos = {
      aulas_semanais: r.aulasSemanais,
      tamanho_bloco: r.tamanhoBloco,
      grupo_paralelo: r.grupoParalelo,
    }
    let id = r.id
    if (id) await trx('atribuicao').where({ id }).update(campos)
    else {
      ;[id] = await trx('atribuicao').insert({
        ...campos,
        periodo_id: periodoId,
        turma_id: turmaId,
        disciplina_id: disciplinaId,
      })
    }

    await trx('atribuicao_professor').where({ atribuicao_id: id }).delete()
    await trx('atribuicao_professor').insert(
      professores.map((p) => ({ atribuicao_id: id, professor_id: p.id }))
    )
  },
}

export async function confirmarImportacao({ periodoId, lidos, usuarioId, versao = null }) {
  return db.transaction(async (trx) => {
    const previa = await gerarPrevia(trx, periodoId, lidos, { versao })

    if (!previa.podeConfirmar) {
      const temErro = previa.arquivos.some((a) => a.erro || a.resumo.rejeitar > 0)
      if (temErro) {
        throw new ErroConflito(
          'Há arquivos ou linhas rejeitados; corrija a planilha e envie de novo. Nada foi gravado.',
          semIds(previa)
        )
      }
      throw new ErroValidacao(
        semIds(previa),
        'Não há nada a gravar: as linhas já estão iguais ao cadastro.'
      )
    }

    for (const arquivo of previa.arquivos) {
      if (arquivo.tipo === 'oferta') {
        await gravarOferta(trx, periodoId, arquivo)
        if (versao && arquivo.horario) await gravarNoHorario(trx, periodoId, versao.id, arquivo)
        continue
      }
      for (const linha of arquivo.linhas) {
        if (linha.situacao === SITUACAO.CRIAR || linha.situacao === SITUACAO.ATUALIZAR) {
          await gravadores[arquivo.tipo](trx, linha.registro, periodoId)
        }
      }
    }

    if (previa.aulasParaRevisar.length) {
      await trx('aula').whereIn('id', previa.aulasParaRevisar).update({ revisar: true })
    }

    const importacoes = []
    for (const arquivo of previa.arquivos) {
      const [id] = await trx('importacao').insert({
        periodo_id: periodoId,
        tipo: arquivo.tipo,
        arquivo: arquivo.arquivo.slice(0, 255),
        usuario_id: usuarioId ?? null,
        criadas: arquivo.resumo.criar,
        atualizadas: arquivo.resumo.atualizar,
        rejeitadas: arquivo.resumo.rejeitar,
        relatorio: JSON.stringify(relatorioDoArquivo(arquivo)),
      })
      importacoes.push(id)
    }

    return { ...semIds(previa), importacoes }
  })
}

// O relatório guardado no histórico: sem os registros internos, só o que o usuário viu.
export function relatorioDoArquivo(arquivo) {
  return {
    formato: arquivo.formato,
    codificacao: arquivo.codificacao,
    separador: arquivo.separador,
    colunasIgnoradas: arquivo.colunasIgnoradas ?? [],
    avisos: arquivo.avisos ?? [],
    resumo: arquivo.resumo,
    horario: arquivo.horario ?? null,
    linhas: arquivo.linhas.map(({ registro: _registro, ...linha }) => linha),
  }
}

// Resposta da API: tira os registros internos e a lista de ids de aulas.
export function semIds(previa) {
  const { aulasParaRevisar: _ids, ...resto } = previa
  return {
    ...resto,
    arquivos: previa.arquivos.map((a) => ({
      ...a,
      linhas: a.linhas.map(({ registro: _registro, ...linha }) => linha),
    })),
  }
}
