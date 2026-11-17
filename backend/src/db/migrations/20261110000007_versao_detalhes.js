// F3-05 — Detalhes da geração gravados na versão: custo das rígidas (a grade só
// é válida com zero) e um resumo da execução (iterações, tempo, aulas sem lugar).

export async function up(knex) {
  await knex.schema.alterTable('versao_grade', (t) => {
    t.integer('custo_rigido').unsigned().nullable().after('pontuacao')
    t.json('detalhes').nullable().after('pontuacao_por_restricao')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('versao_grade', (t) => {
    t.dropColumn('detalhes')
    t.dropColumn('custo_rigido')
  })
}
