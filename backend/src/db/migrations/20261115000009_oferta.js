// Importação pela planilha de oferta (um arquivo só por período):
// - o professor é identificado pelo nome, então o SIAPE deixa de ser obrigatório;
// - a turma é identificada por turma + curso + período do curso (chave_oferta),
//   porque o mesmo rótulo ("Outros Int") pode reunir turmas de cursos diferentes;
// - turma criada sem turno na planilha recebe todos os turnos e fica com
//   turnos_definidos = false até o gestor escolher;
// - o histórico de importação aceita o tipo "oferta".

export async function up(knex) {
  await knex.schema.alterTable('professor', (t) => {
    t.string('siape', 20).nullable().alter()
  })
  await knex.schema.alterTable('turma', (t) => {
    t.string('chave_oferta', 200).nullable().after('codigo')
    t.boolean('turnos_definidos').notNullable().defaultTo(true).after('turnos_permitidos')
    t.unique(['periodo_id', 'chave_oferta'])
  })
  await knex.raw(
    "ALTER TABLE importacao MODIFY tipo ENUM('professores','turmas','disciplinas','atribuicoes','salas','oferta') NOT NULL"
  )
}

export async function down(knex) {
  await knex.raw("DELETE FROM importacao WHERE tipo = 'oferta'")
  await knex.raw(
    "ALTER TABLE importacao MODIFY tipo ENUM('professores','turmas','disciplinas','atribuicoes','salas') NOT NULL"
  )
  await knex.schema.alterTable('turma', (t) => {
    t.dropUnique(['periodo_id', 'chave_oferta'])
    t.dropColumn('turnos_definidos')
    t.dropColumn('chave_oferta')
  })
  await knex.schema.alterTable('professor', (t) => {
    t.string('siape', 20).notNullable().alter()
  })
}
