// Cor do professor nas grades (#rrggbb). NULL = cor automática, calculada pelo id
// (ver src/core/cores.js).

export async function up(knex) {
  await knex.schema.alterTable('professor', (t) => {
    t.string('cor', 7).nullable().after('email')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('professor', (t) => {
    t.dropColumn('cor')
  })
}
