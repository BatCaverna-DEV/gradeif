// Cria e migra a base de teste antes de qualquer arquivo de teste.
import knex from 'knex'

export default async function setup(project) {
  process.env.NODE_ENV = 'test'
  process.env.DB_NAME = 'horarios_test'

  const { env } = await import('../src/config/env.js')
  const admin = knex({
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    },
  })

  let disponivel = false
  try {
    await admin.raw(
      'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      [env.DB_NAME]
    )
    disponivel = true
  } catch (erro) {
    console.warn(
      `MariaDB indisponível (${erro.code ?? erro.message}); testes de banco serão pulados.`
    )
  } finally {
    await admin.destroy()
  }

  if (disponivel) {
    const { default: knexfile } = await import('../knexfile.js')
    const db = knex(knexfile.test)
    await db.migrate.latest()
    await db.destroy()
  }

  project.provide('bancoDisponivel', disponivel)
}
