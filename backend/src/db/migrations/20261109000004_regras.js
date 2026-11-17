// F1-09 — Regras: indisponibilidade (professor, turma ou sala em um horário)
// e restricao_config (peso e ativação de cada restrição por período).

export async function up(knex) {
  await knex.schema.createTable('indisponibilidade', (t) => {
    t.increments('id')
    t.integer('periodo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('periodo_letivo')
      .onDelete('CASCADE')
    t.enu('tipo_recurso', ['professor', 'turma', 'sala']).notNullable()
    t.integer('recurso_id').unsigned().notNullable() // id na tabela do tipo_recurso
    t.integer('horario_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('horario')
      .onDelete('CASCADE')
    t.boolean('rigida').notNullable().defaultTo(true) // false = preferência (F5)
    t.string('motivo', 200).nullable()
    t.timestamps(true, true)
    t.unique(['tipo_recurso', 'recurso_id', 'horario_id'])
    t.index(['periodo_id', 'tipo_recurso', 'recurso_id'])
  })

  await knex.schema.createTable('restricao_config', (t) => {
    t.increments('id')
    t.integer('periodo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('periodo_letivo')
      .onDelete('CASCADE')
    t.string('codigo', 10).notNullable() // R1..R8, F1..F10
    t.boolean('ativa').notNullable().defaultTo(true)
    t.integer('peso').unsigned().notNullable().defaultTo(5) // 1 a 10; ignorado nas rígidas
    t.json('parametros').nullable()
    t.unique(['periodo_id', 'codigo'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('restricao_config')
  await knex.schema.dropTableIfExists('indisponibilidade')
}
