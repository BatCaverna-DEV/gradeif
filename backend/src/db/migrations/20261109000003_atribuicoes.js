// F1-08 — Atribuições: disciplina de uma turma no período, com seus professores.
// grupo_paralelo: atribuições da mesma turma com o mesmo grupo podem ocupar o
// mesmo horário (turma dividida entre laboratório e sala, por exemplo).

export async function up(knex) {
  await knex.schema.createTable('atribuicao', (t) => {
    t.increments('id')
    t.integer('periodo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('periodo_letivo')
      .onDelete('CASCADE')
    t.integer('turma_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('turma')
      .onDelete('CASCADE')
    t.integer('disciplina_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('disciplina')
      .onDelete('RESTRICT')
    t.integer('aulas_semanais').unsigned().notNullable()
    t.integer('tamanho_bloco').unsigned().notNullable().defaultTo(1) // aulas geminadas
    t.string('grupo_paralelo', 40).nullable()
    t.timestamps(true, true)
    t.unique(['turma_id', 'disciplina_id']) // chave de importação
  })

  await knex.schema.createTable('atribuicao_professor', (t) => {
    t.integer('atribuicao_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('atribuicao')
      .onDelete('CASCADE')
    t.integer('professor_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('professor')
      .onDelete('RESTRICT')
    t.primary(['atribuicao_id', 'professor_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('atribuicao_professor')
  await knex.schema.dropTableIfExists('atribuicao')
}
