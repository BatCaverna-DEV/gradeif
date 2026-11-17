// Editor de cada horário (versao_grade.editor_id): um editor por vez.
// Só o editor altera o horário (atribuições, disponibilidade, geração, editor de
// grade, nome, publicação e exclusão); os outros gestores apenas visualizam e
// podem duplicar. Quem cria o horário vira o editor. O editor transfere a edição
// para outro gestor ativo. Um horário sem editor válido (nenhum, ou a conta do
// editor desativada ou que deixou de ser gestor) pode ser assumido por um gestor.

import { db } from '../db/knex.js'
import { ErroNaoEncontrado, ErroProibido, ErroValidacao } from '../erros.js'

// Editor efetivo: só conta se a conta ainda estiver ativa e for de gestor.
export const editorValido = (linha) =>
  linha.editor_id != null && !!linha.editor_ativo && linha.editor_perfil === 'gestor'

// Campos do editor para juntar à consulta de versao_grade (alias "v").
export function comEditor(consulta) {
  return consulta
    .leftJoin('usuario as ed', 'ed.id', 'v.editor_id')
    .select('ed.nome as editor_nome', 'ed.ativo as editor_ativo', 'ed.perfil as editor_perfil')
}

export function paraEditor(linha) {
  return editorValido(linha) ? { id: linha.editor_id, nome: linha.editor_nome } : null
}

async function buscar(periodoId, versaoId, trx = db) {
  const linha = await comEditor(
    trx('versao_grade as v').where({ 'v.id': versaoId, 'v.periodo_id': periodoId }).select('v.*')
  ).first()
  if (!linha) throw new ErroNaoEncontrado('Horário não encontrado neste período')
  return linha
}

// Lança 403 se o usuário não for o editor do horário.
export async function exigirEditor(periodoId, versaoId, usuario) {
  const linha = await buscar(periodoId, versaoId)
  if (!editorValido(linha)) {
    throw new ErroProibido('Este horário está sem editor. Assuma a edição para alterá-lo.', {
      editor: null,
    })
  }
  if (linha.editor_id !== usuario.id) {
    throw new ErroProibido(
      `Somente ${linha.editor_nome}, editor deste horário, pode alterá-lo. Peça que transfira a edição para você.`,
      { editor: paraEditor(linha) }
    )
  }
  return linha
}

// O editor atual passa a edição para outro gestor ativo.
export async function transferirEdicao(periodoId, versaoId, usuario, destinoId) {
  await exigirEditor(periodoId, versaoId, usuario)
  if (destinoId === usuario.id) {
    throw new ErroValidacao(
      [{ campo: 'usuarioId', mensagem: 'Você já é o editor deste horário' }],
      'Você já é o editor deste horário'
    )
  }
  const destino = await db('usuario').where({ id: destinoId }).first()
  if (!destino || !destino.ativo || destino.perfil !== 'gestor') {
    throw new ErroValidacao(
      [{ campo: 'usuarioId', mensagem: 'Escolha um gestor ativo' }],
      'A edição só pode ser transferida para um gestor ativo'
    )
  }
  // Condicional: se outro pedido mudou o editor no meio do caminho, nada muda.
  const alteradas = await db('versao_grade')
    .where({ id: versaoId, periodo_id: periodoId, editor_id: usuario.id })
    .update({ editor_id: destinoId })
  if (!alteradas) throw new ErroProibido('Você não é mais o editor deste horário')
  return { id: destino.id, nome: destino.nome }
}

// Um gestor assume um horário sem editor válido.
export async function assumirEdicao(periodoId, versaoId, usuario) {
  const linha = await buscar(periodoId, versaoId)
  if (editorValido(linha)) {
    if (linha.editor_id === usuario.id) return { id: usuario.id, nome: usuario.nome }
    throw new ErroProibido(
      `Este horário já tem editor: ${linha.editor_nome}. Peça que transfira a edição para você.`,
      { editor: paraEditor(linha) }
    )
  }
  // Condicional: só assume se continuar sem editor válido (dois gestores ao mesmo tempo).
  const alteradas = await db('versao_grade')
    .where({ id: versaoId, periodo_id: periodoId })
    .where((q) =>
      q.whereNull('editor_id').orWhereIn(
        'editor_id',
        db('usuario')
          .where((u) => u.where('ativo', false).orWhereNot('perfil', 'gestor'))
          .select('id')
      )
    )
    .update({ editor_id: usuario.id })
  if (!alteradas) throw new ErroProibido('Outro gestor assumiu este horário agora há pouco')
  return { id: usuario.id, nome: usuario.nome }
}
