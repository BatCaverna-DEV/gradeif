// Serviço de importação usado pelas rotas: prévia, confirmação e histórico.
import { db } from '../db/knex.js'
import { ErroConflito, ErroNaoEncontrado } from '../erros.js'
import { gerarPrevia, lerArquivos } from '../importacao/previa.js'
import { confirmarImportacao, semIds } from '../importacao/gravacao.js'

async function exigirPeriodo(periodoId) {
  const periodo = await db('periodo_letivo').where({ id: periodoId }).first('id')
  if (!periodo) throw new ErroNaoEncontrado('Período letivo não encontrado')
}

// Horário de destino da importação: do período e ainda não publicado.
async function horarioDeDestino(periodoId, versaoId) {
  if (!versaoId) return null
  const versao = await db('versao_grade')
    .where({ id: versaoId, periodo_id: periodoId })
    .first('id', 'nome', 'publicada')
  if (!versao) throw new ErroNaoEncontrado('Horário não encontrado neste período')
  if (versao.publicada) {
    throw new ErroConflito(
      'O horário publicado não pode ser alterado; duplique-o para importar nele'
    )
  }
  return { id: versao.id, nome: versao.nome }
}

export async function previa(periodoId, arquivos, { versaoId = null } = {}) {
  await exigirPeriodo(periodoId)
  const versao = await horarioDeDestino(periodoId, versaoId)
  const lidos = await lerArquivos(arquivos)
  return semIds(await gerarPrevia(db, periodoId, lidos, { versao }))
}

export async function confirmar(periodoId, arquivos, usuarioId, { versaoId = null } = {}) {
  await exigirPeriodo(periodoId)
  const versao = await horarioDeDestino(periodoId, versaoId)
  const lidos = await lerArquivos(arquivos)
  return confirmarImportacao({ periodoId, lidos, usuarioId, versao })
}

function paraHistorico(linha) {
  return {
    id: linha.id,
    tipo: linha.tipo,
    arquivo: linha.arquivo,
    usuario: linha.usuario ?? null,
    criadas: linha.criadas,
    atualizadas: linha.atualizadas,
    rejeitadas: linha.rejeitadas,
    criadoEm: linha.criado_em,
  }
}

export async function historico(periodoId) {
  await exigirPeriodo(periodoId)
  const linhas = await db('importacao as i')
    .leftJoin('usuario as u', 'u.id', 'i.usuario_id')
    .where('i.periodo_id', periodoId)
    .orderBy('i.id', 'desc')
    .limit(200)
    .select('i.*', 'u.nome as usuario')
  return linhas.map(paraHistorico)
}

export async function detalhe(periodoId, id) {
  const linha = await db('importacao as i')
    .leftJoin('usuario as u', 'u.id', 'i.usuario_id')
    .where({ 'i.id': id, 'i.periodo_id': periodoId })
    .first('i.*', 'u.nome as usuario')
  if (!linha) throw new ErroNaoEncontrado('Importação não encontrada')
  const relatorio =
    typeof linha.relatorio === 'string' ? JSON.parse(linha.relatorio) : linha.relatorio
  return { ...paraHistorico(linha), relatorio }
}
