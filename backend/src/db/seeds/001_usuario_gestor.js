import bcrypt from 'bcryptjs'
import { env } from '../../config/env.js'

// Cria (ou mantém) o usuário gestor inicial definido em GESTOR_EMAIL / GESTOR_SENHA.
export async function seed(knex) {
  const existente = await knex('usuario').where({ email: env.GESTOR_EMAIL }).first()
  if (existente) return

  await knex('usuario').insert({
    nome: env.GESTOR_NOME,
    email: env.GESTOR_EMAIL,
    senha_hash: await bcrypt.hash(env.GESTOR_SENHA, 10),
    perfil: 'gestor',
    ativo: true,
  })
}
