import { fileURLToPath } from 'node:url'
import { env } from './src/config/env.js'

// Caminhos absolutos: o knexfile também é usado pelos testes, que rodam de outra pasta.
const pasta = (relativo) => fileURLToPath(new URL(relativo, import.meta.url))

const base = {
  client: 'mysql2',
  connection: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z',
  },
  pool: {
    min: 0,
    max: 10,
    // Cada conexão trabalha em UTC: assim CURRENT_TIMESTAMP grava UTC e o driver
    // (timezone 'Z') lê o mesmo instante, qualquer que seja o fuso do servidor.
    afterCreate: (conexao, pronto) =>
      conexao.query("SET time_zone = '+00:00'", (erro) => pronto(erro, conexao)),
  },
  migrations: {
    directory: pasta('./src/db/migrations'),
    tableName: 'knex_migrations',
    loadExtensions: ['.js'],
  },
  seeds: {
    directory: pasta('./src/db/seeds'),
    loadExtensions: ['.js'],
  },
}

export default {
  development: base,
  test: base,
  production: base,
}
