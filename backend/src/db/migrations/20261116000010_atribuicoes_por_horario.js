// Cada horário (versao_grade) passa a ter as próprias atribuições.
//   atribuicao.versao_id NULL  → atribuição da oferta do período (importação e Dados);
//                                serve de base para criar horários.
//   atribuicao.versao_id = v   → atribuição só do horário v; mudar aqui não afeta
//                                a oferta nem os outros horários.
// A unicidade (turma, disciplina) passa a valer dentro de cada escopo. Como o
// banco não compara NULL em índice único, o escopo é uma coluna calculada.
// A coluna é VIRTUAL (calculada na leitura, com índice): funciona no MariaDB e no
// MySQL. PERSISTENT só o MariaDB aceita, e o MySQL recusa STORED quando a coluna
// base (versao_id) tem chave estrangeira com ON DELETE CASCADE.
// Versões já existentes recebem cópias das atribuições da oferta, e as aulas delas
// passam a apontar para as cópias.

export async function up(knex) {
  await knex.schema.alterTable('atribuicao', (t) => {
    t.integer('versao_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('versao_grade')
      .onDelete('CASCADE')
      .after('periodo_id')
  })
  await knex.raw(
    'ALTER TABLE atribuicao ADD COLUMN escopo INT UNSIGNED AS (IFNULL(versao_id, 0)) VIRTUAL AFTER versao_id'
  )
  // O índice novo começa por turma_id, então continua servindo à chave estrangeira.
  await knex.schema.alterTable('atribuicao', (t) => {
    t.unique(['turma_id', 'disciplina_id', 'escopo'], {
      indexName: 'atribuicao_turma_disciplina_escopo_unique',
    })
  })
  await knex.schema.alterTable('atribuicao', (t) => {
    t.dropUnique(['turma_id', 'disciplina_id'])
  })

  const versoes = await knex('versao_grade').select('id', 'periodo_id')
  for (const v of versoes) {
    const base = await knex('atribuicao').where({ periodo_id: v.periodo_id }).whereNull('versao_id')
    for (const a of base) {
      const { id: antigo, escopo: _escopo, created_at: _c, updated_at: _u, ...campos } = a
      const [novo] = await knex('atribuicao').insert({ ...campos, versao_id: v.id })
      const professores = await knex('atribuicao_professor').where({ atribuicao_id: antigo })
      if (professores.length) {
        await knex('atribuicao_professor').insert(
          professores.map((p) => ({ atribuicao_id: novo, professor_id: p.professor_id }))
        )
      }
      await knex('aula')
        .where({ versao_id: v.id, atribuicao_id: antigo })
        .update({ atribuicao_id: novo })
    }
  }
}

export async function down(knex) {
  // Aulas voltam a apontar para a atribuição da oferta equivalente (turma + disciplina).
  const copias = await knex('atribuicao').whereNotNull('versao_id')
  for (const c of copias) {
    const base = await knex('atribuicao')
      .where({ turma_id: c.turma_id, disciplina_id: c.disciplina_id })
      .whereNull('versao_id')
      .first('id')
    if (base) await knex('aula').where({ atribuicao_id: c.id }).update({ atribuicao_id: base.id })
  }
  await knex('atribuicao').whereNotNull('versao_id').delete()
  await knex.schema.alterTable('atribuicao', (t) => {
    t.unique(['turma_id', 'disciplina_id'])
  })
  await knex.schema.alterTable('atribuicao', (t) => {
    t.dropUnique([], 'atribuicao_turma_disciplina_escopo_unique')
  })
  await knex.raw('ALTER TABLE atribuicao DROP COLUMN escopo')
  await knex.schema.alterTable('atribuicao', (t) => {
    t.dropForeign(['versao_id'])
    t.dropColumn('versao_id')
  })
}
