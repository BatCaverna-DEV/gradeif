// Disponibilidade (indisponibilidade) por horário, como as atribuições.
//   versao_id NULL → padrão do período: o que os professores informam pela conta
//                    deles; é copiado para cada horário novo.
//   versao_id = v  → só do horário v; o gestor ajusta por proposta.
// A unicidade (recurso, tempo de aula) vale dentro de cada escopo. Horários já
// existentes recebem uma cópia do padrão do período.
// Coluna calculada VIRTUAL (com índice): funciona no MariaDB e no MySQL. PERSISTENT
// só o MariaDB aceita, e o MySQL recusa STORED quando a coluna base (versao_id) tem
// chave estrangeira com ON DELETE CASCADE.

export async function up(knex) {
  await knex.schema.alterTable('indisponibilidade', (t) => {
    t.integer('versao_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('versao_grade')
      .onDelete('CASCADE')
      .after('periodo_id')
  })
  await knex.raw(
    'ALTER TABLE indisponibilidade ADD COLUMN escopo INT UNSIGNED AS (IFNULL(versao_id, 0)) VIRTUAL AFTER versao_id'
  )
  await knex.schema.alterTable('indisponibilidade', (t) => {
    t.unique(['tipo_recurso', 'recurso_id', 'horario_id', 'escopo'], {
      indexName: 'indisponibilidade_recurso_horario_escopo_unique',
    })
  })
  await knex.schema.alterTable('indisponibilidade', (t) => {
    t.dropUnique(['tipo_recurso', 'recurso_id', 'horario_id'])
  })

  const versoes = await knex('versao_grade').select('id', 'periodo_id')
  for (const v of versoes) {
    const padrao = await knex('indisponibilidade')
      .where({ periodo_id: v.periodo_id })
      .whereNull('versao_id')
    if (padrao.length) {
      await knex('indisponibilidade').insert(
        padrao.map((i) => ({
          periodo_id: i.periodo_id,
          versao_id: v.id,
          tipo_recurso: i.tipo_recurso,
          recurso_id: i.recurso_id,
          horario_id: i.horario_id,
          rigida: i.rigida,
          motivo: i.motivo,
        }))
      )
    }
  }
}

export async function down(knex) {
  await knex('indisponibilidade').whereNotNull('versao_id').delete()
  await knex.schema.alterTable('indisponibilidade', (t) => {
    t.unique(['tipo_recurso', 'recurso_id', 'horario_id'])
  })
  await knex.schema.alterTable('indisponibilidade', (t) => {
    t.dropUnique([], 'indisponibilidade_recurso_horario_escopo_unique')
  })
  await knex.raw('ALTER TABLE indisponibilidade DROP COLUMN escopo')
  await knex.schema.alterTable('indisponibilidade', (t) => {
    t.dropForeign(['versao_id'])
    t.dropColumn('versao_id')
  })
}
