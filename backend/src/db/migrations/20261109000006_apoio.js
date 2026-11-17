// F1-11 — Apoio: usuario (acesso) e importacao (histórico de arquivos carregados).

export async function up(knex) {
  await knex.schema.createTable('usuario', (t) => {
    t.increments('id')
    t.string('nome', 120).notNullable()
    t.string('email', 120).notNullable().unique()
    t.string('senha_hash', 100).notNullable()
    t.enu('perfil', ['gestor', 'professor']).notNullable().defaultTo('professor')
    t.integer('professor_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('professor')
      .onDelete('SET NULL')
    t.boolean('ativo').notNullable().defaultTo(true)
    t.timestamps(true, true)
  })

  await knex.schema.createTable('importacao', (t) => {
    t.increments('id')
    t.integer('periodo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('periodo_letivo')
      .onDelete('CASCADE')
    t.enu('tipo', ['professores', 'turmas', 'disciplinas', 'atribuicoes', 'salas']).notNullable()
    t.string('arquivo', 255).notNullable()
    t.integer('usuario_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('usuario')
      .onDelete('SET NULL')
    t.integer('criadas').unsigned().notNullable().defaultTo(0)
    t.integer('atualizadas').unsigned().notNullable().defaultTo(0)
    t.integer('rejeitadas').unsigned().notNullable().defaultTo(0)
    t.json('relatorio').nullable() // linhas com situação e motivo
    t.timestamp('criado_em').notNullable().defaultTo(knex.fn.now())
    t.index(['periodo_id', 'tipo'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('importacao')
  await knex.schema.dropTableIfExists('usuario')
}
