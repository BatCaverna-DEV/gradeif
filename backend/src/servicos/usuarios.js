// F1-12 e F5-08 — Usuários: autenticação, contas de gestor e de professor.
import bcrypt from 'bcryptjs'
import { db } from '../db/knex.js'
import { armazemPadrao } from '../db/sessoes.js'
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from '../erros.js'

// Hash usado quando o e-mail não existe, para que o tempo de resposta
// não revele quais e-mails estão cadastrados.
const HASH_FICTICIO = bcrypt.hashSync('usuario-inexistente', 10)
const CUSTO_HASH = 10

export function paraSessao(linha) {
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    perfil: linha.perfil,
    professorId: linha.professor_id,
  }
}

export async function autenticar(email, senha) {
  const linha = await db('usuario').where({ email, ativo: true }).first()
  const confere = await bcrypt.compare(senha, linha?.senha_hash ?? HASH_FICTICIO)
  if (!linha || !confere) return null
  return paraSessao(linha)
}

function paraUsuario(l) {
  return {
    id: l.id,
    nome: l.nome,
    email: l.email,
    perfil: l.perfil,
    professorId: l.professor_id,
    professor: l.professor ?? null,
    ativo: !!l.ativo,
    criadoEm: l.created_at,
  }
}

function consulta() {
  return db('usuario as u')
    .leftJoin('professor as p', 'p.id', 'u.professor_id')
    .select('u.*', 'p.nome as professor')
}

export async function listarUsuarios() {
  return (await consulta().orderBy('u.nome')).map(paraUsuario)
}

async function validarVinculo(perfil, professorId, ignorarUsuario = null) {
  if (perfil === 'professor' && !professorId) {
    throw new ErroValidacao(
      [{ campo: 'professorId', mensagem: 'Conta de professor precisa do professor vinculado' }],
      'Conta de professor precisa do professor vinculado'
    )
  }
  if (!professorId) return
  if (!(await db('professor').where({ id: professorId }).first())) {
    throw new ErroValidacao([{ campo: 'professorId', mensagem: 'Professor não encontrado' }])
  }
  const outra = await db('usuario')
    .where({ professor_id: professorId })
    .modify((q) => (ignorarUsuario ? q.whereNot('id', ignorarUsuario) : q))
    .first()
  if (outra) {
    throw new ErroConflito(`Este professor já tem a conta ${outra.email}`)
  }
}

async function emailLivre(email, ignorarUsuario = null) {
  const outro = await db('usuario')
    .where({ email })
    .modify((q) => (ignorarUsuario ? q.whereNot('id', ignorarUsuario) : q))
    .first()
  if (outro) throw new ErroConflito(`Já existe uma conta com o e-mail ${email}`)
}

export async function criarUsuario({ nome, email, perfil, professorId = null, senha }) {
  await emailLivre(email)
  await validarVinculo(perfil, professorId)
  const [id] = await db('usuario').insert({
    nome,
    email,
    perfil,
    professor_id: professorId,
    senha_hash: await bcrypt.hash(senha, CUSTO_HASH),
  })
  return paraUsuario(await consulta().where('u.id', id).first())
}

// O gestor não pode tirar o próprio acesso (desativar-se ou deixar de ser gestor).
export async function atualizarUsuario(id, dados, usuarioAtual) {
  const atual = await db('usuario').where({ id }).first()
  if (!atual) throw new ErroNaoEncontrado('Usuário não encontrado')
  if (
    id === usuarioAtual.id &&
    (dados.ativo === false || (dados.perfil && dados.perfil !== 'gestor'))
  ) {
    throw new ErroConflito('Você não pode desativar a própria conta nem deixar de ser gestor')
  }
  const perfil = dados.perfil ?? atual.perfil
  const professorId = dados.professorId !== undefined ? dados.professorId : atual.professor_id
  if (dados.email && dados.email !== atual.email) await emailLivre(dados.email, id)
  await validarVinculo(perfil, professorId, id)

  const mudancas = { perfil, professor_id: professorId, updated_at: db.fn.now() }
  if (dados.nome) mudancas.nome = dados.nome
  if (dados.email) mudancas.email = dados.email
  if (dados.ativo !== undefined) mudancas.ativo = dados.ativo
  if (dados.senha) mudancas.senha_hash = await bcrypt.hash(dados.senha, CUSTO_HASH)
  await db('usuario').where({ id }).update(mudancas)

  // Desativação, troca de senha ou de perfil derrubam as sessões abertas da conta.
  if (dados.ativo === false || dados.senha || perfil !== atual.perfil) {
    await armazemPadrao()?.encerrarDoUsuario(id)
  }
  return paraUsuario(await consulta().where('u.id', id).first())
}

export async function alterarSenha(usuarioId, senhaAtual, novaSenha, sidAtual) {
  const linha = await db('usuario').where({ id: usuarioId }).first()
  if (!linha || !(await bcrypt.compare(senhaAtual, linha.senha_hash))) {
    throw new ErroValidacao(
      [{ campo: 'senhaAtual', mensagem: 'Senha atual incorreta' }],
      'Senha atual incorreta'
    )
  }
  await db('usuario')
    .where({ id: usuarioId })
    .update({ senha_hash: await bcrypt.hash(novaSenha, CUSTO_HASH), updated_at: db.fn.now() })
  // Mantém só a sessão em uso.
  await armazemPadrao()?.encerrarDoUsuario(usuarioId, sidAtual)
}
