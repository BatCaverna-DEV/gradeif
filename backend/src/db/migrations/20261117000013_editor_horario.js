// Editor de cada horário (versao_grade): só ele altera o horário; os outros
// gestores apenas visualizam. Quem cria o horário vira o editor, e o editor pode
// transferir a edição para outro gestor. Horários sem editor (os anteriores a
// esta migration, ou cujo editor foi excluído) podem ser assumidos por um gestor.

export async function up(knex) {
  await knex.schema.alterTable('versao_grade', (t) => {
    t.integer('editor_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('usuario')
      .onDelete('SET NULL')
      .after('nome')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('versao_grade', (t) => {
    t.dropForeign(['editor_id'])
    t.dropColumn('editor_id')
  })
}
