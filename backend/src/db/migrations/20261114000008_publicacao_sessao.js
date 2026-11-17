// F5-01 e F5-09 — Data de publicação da versão e sessões persistentes no banco.
// Com as sessões no MariaDB, reiniciar a API (PM2, implantação) não desconecta
// ninguém, e mais de um processo pode atender o mesmo usuário.

export async function up(knex) {
  await knex.schema.alterTable('versao_grade', (t) => {
    t.timestamp('publicada_em').nullable().after('publicada')
  })

  await knex.schema.createTable('sessao', (t) => {
    t.string('sid', 128).primary()
    t.text('dados', 'mediumtext').notNullable()
    t.datetime('expira_em').notNullable().index()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('sessao')
  await knex.schema.alterTable('versao_grade', (t) => {
    t.dropColumn('publicada_em')
  })
}
