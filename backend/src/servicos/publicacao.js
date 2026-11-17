// F5-01 — Publicação: no máximo uma versão publicada por período. A versão
// publicada é a que a consulta pública mostra, e não pode ser editada nem excluída.

import { db } from '../db/knex.js'
import { ErroConflito, ErroNaoEncontrado } from '../erros.js'
import { avaliarVersao, resumoVersao } from './versoes.js'

export async function publicarVersao(periodoId, versaoId, { forcar = false } = {}) {
  const versao = await db('versao_grade').where({ id: versaoId, periodo_id: periodoId }).first()
  if (!versao) throw new ErroNaoEncontrado('Versão da grade não encontrada neste período')

  // Avalia com os dados atuais: a pontuação gravada pode estar desatualizada.
  const avaliacao = await avaliarVersao(periodoId, versaoId)
  const faltando = avaliacao.violacoes
    .filter((v) => v.codigo === 'R4' && v.mensagem.includes('falta'))
    .reduce((s, v) => s + v.custo, 0)
  if (!avaliacao.valida && !forcar) {
    const partes = [`${avaliacao.custoRigido} violação(ões) de regra rígida`]
    if (faltando) partes.push(`${faltando} aula(s) sem lugar`)
    throw new ErroConflito(
      `A versão tem ${partes.join(' e ')}. Publique mesmo assim só se a grade for usada desse jeito.`,
      { custoRigido: avaliacao.custoRigido, faltando, exigeConfirmacao: true }
    )
  }

  await db.transaction(async (trx) => {
    await trx('versao_grade')
      .where({ periodo_id: periodoId })
      .update({ publicada: false, publicada_em: null })
    await trx('versao_grade')
      .where({ id: versaoId })
      .update({
        publicada: true,
        publicada_em: trx.fn.now(),
        pontuacao: avaliacao.pontuacao,
        custo_rigido: avaliacao.custoRigido,
        pontuacao_por_restricao: JSON.stringify(avaliacao.pontuacaoPorRestricao),
      })
    await trx('periodo_letivo')
      .where({ id: periodoId })
      .whereNot({ situacao: 'encerrado' })
      .update({ situacao: 'publicado' })
  })
  return resumoVersao(periodoId, versaoId)
}

// Tira a publicação: a consulta pública deixa de mostrar o período.
export async function despublicarVersao(periodoId, versaoId) {
  const versao = await db('versao_grade').where({ id: versaoId, periodo_id: periodoId }).first()
  if (!versao) throw new ErroNaoEncontrado('Versão da grade não encontrada neste período')
  if (!versao.publicada) throw new ErroConflito('Esta versão não está publicada')
  await db.transaction(async (trx) => {
    await trx('versao_grade')
      .where({ id: versaoId })
      .update({ publicada: false, publicada_em: null })
    await trx('periodo_letivo')
      .where({ id: periodoId, situacao: 'publicado' })
      .update({ situacao: 'planejamento' })
  })
  return resumoVersao(periodoId, versaoId)
}
