// F1-10 — Grade: versao_grade (cenário) e aula (alocação).
// Índice único (versão + horário + sala) impede duas aulas na mesma sala no banco.
// Choques de professor e turma são verificados na API/core, pois dependem de junções.

export async function up(knex) {
  await knex.schema.createTable('versao_grade', (t) => {
    t.increments('id')
    t.integer('periodo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('periodo_letivo')
      .onDelete('CASCADE')
    t.string('nome', 80).notNullable()
    t.enu('origem', ['solver', 'manual']).notNullable().defaultTo('manual')
    t.string('semente', 40).nullable() // reproduz o resultado do solver
    t.decimal('pontuacao', 12, 2).nullable()
    t.json('pontuacao_por_restricao').nullable()
    t.boolean('publicada').notNullable().defaultTo(false)
    t.timestamps(true, true)
    t.index(['periodo_id', 'publicada'])
  })

  await knex.schema.createTable('aula', (t) => {
    t.increments('id')
    t.integer('versao_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('versao_grade')
      .onDelete('CASCADE')
    t.integer('atribuicao_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('atribuicao')
      .onDelete('CASCADE')
    t.integer('horario_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('horario')
      .onDelete('RESTRICT')
    t.integer('sala_id').unsigned().nullable().references('id').inTable('sala').onDelete('RESTRICT')
    t.boolean('fixada').notNullable().defaultTo(false) // R8
    t.boolean('revisar').notNullable().defaultTo(false) // marcada após reimportação (F1-19)
    t.unique(['versao_id', 'horario_id', 'sala_id']) // R3 garantido pelo banco
    t.index(['versao_id', 'atribuicao_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('aula')
  await knex.schema.dropTableIfExists('versao_grade')
}
