// F1-06 — Estrutura do período: periodo_letivo, turno, horario.
// Turnos e horários pertencem ao período para que a grade horária possa mudar
// entre períodos sem afetar versões antigas.

export async function up(knex) {
  await knex.schema.createTable('periodo_letivo', (t) => {
    t.increments('id')
    t.string('nome', 20).notNullable().unique() // ex.: 2027.1
    t.date('data_inicio').notNullable()
    t.date('data_fim').notNullable()
    t.enu('situacao', ['planejamento', 'publicado', 'encerrado'])
      .notNullable()
      .defaultTo('planejamento')
    t.timestamps(true, true)
  })

  await knex.schema.createTable('turno', (t) => {
    t.increments('id')
    t.integer('periodo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('periodo_letivo')
      .onDelete('CASCADE')
    t.string('nome', 30).notNullable() // Matutino, Vespertino, Noturno
    t.integer('ordem').notNullable().defaultTo(1)
    t.unique(['periodo_id', 'nome'])
  })

  await knex.schema.createTable('horario', (t) => {
    t.increments('id')
    t.integer('periodo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('periodo_letivo')
      .onDelete('CASCADE')
    t.integer('turno_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('turno')
      .onDelete('CASCADE')
    t.tinyint('dia_semana').unsigned().notNullable() // 1 = segunda ... 6 = sábado
    t.integer('ordem').notNullable() // 1º tempo, 2º tempo... dentro do turno
    t.time('hora_inicio').notNullable()
    t.time('hora_fim').notNullable()
    t.unique(['turno_id', 'dia_semana', 'ordem'])
    t.index(['periodo_id', 'dia_semana'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('horario')
  await knex.schema.dropTableIfExists('turno')
  await knex.schema.dropTableIfExists('periodo_letivo')
}
