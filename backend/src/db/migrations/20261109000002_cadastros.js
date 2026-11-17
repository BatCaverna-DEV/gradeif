// F1-07 — Cadastros: curso, professor, disciplina, sala (globais) e turma (por período).

export async function up(knex) {
  await knex.schema.createTable('curso', (t) => {
    t.increments('id')
    t.string('nome', 120).notNullable()
    t.enu('nivel', ['integrado', 'subsequente', 'superior']).notNullable()
    t.unique(['nome', 'nivel'])
  })

  await knex.schema.createTable('professor', (t) => {
    t.increments('id')
    t.string('nome', 120).notNullable()
    t.string('siape', 20).notNullable().unique() // chave de importação
    t.string('email', 120)
    t.integer('carga_maxima_semanal').unsigned().notNullable().defaultTo(20)
    t.boolean('ativo').notNullable().defaultTo(true)
    t.timestamps(true, true)
  })

  await knex.schema.createTable('disciplina', (t) => {
    t.increments('id')
    t.string('sigla', 20).notNullable().unique() // chave de importação
    t.string('nome', 150).notNullable()
    t.string('tipo_ambiente', 40).notNullable().defaultTo('sala') // sala, laboratorio, quadra...
    t.timestamps(true, true)
  })

  await knex.schema.createTable('sala', (t) => {
    t.increments('id')
    t.string('nome', 60).notNullable().unique() // chave de importação
    t.string('tipo', 40).notNullable().defaultTo('sala')
    t.integer('capacidade').unsigned().notNullable().defaultTo(40)
    t.boolean('ativa').notNullable().defaultTo(true)
    t.timestamps(true, true)
  })

  await knex.schema.createTable('turma', (t) => {
    t.increments('id')
    t.integer('periodo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('periodo_letivo')
      .onDelete('CASCADE')
    t.string('codigo', 40).notNullable() // chave de importação (dentro do período)
    t.integer('curso_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('curso')
      .onDelete('RESTRICT')
    t.json('turnos_permitidos').notNullable() // lista de ids de turno
    t.integer('numero_alunos').unsigned().notNullable().defaultTo(0)
    t.timestamps(true, true)
    t.unique(['periodo_id', 'codigo'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('turma')
  await knex.schema.dropTableIfExists('sala')
  await knex.schema.dropTableIfExists('disciplina')
  await knex.schema.dropTableIfExists('professor')
  await knex.schema.dropTableIfExists('curso')
}
