import knex from 'knex'
import knexfile from '../../knexfile.js'
import { env } from '../config/env.js'

// Instância única de conexão, compartilhada por toda a API.
export const db = knex(knexfile[env.NODE_ENV] ?? knexfile.development)

export async function verificarBanco() {
  await db.raw('SELECT 1')
}

export async function encerrarBanco() {
  await db.destroy()
}
