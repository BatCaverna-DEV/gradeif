// Atribuições de um horário. Cada horário tem as suas, copiadas da oferta do
// período (ou de outro horário) quando foi criado. Mudar aqui vale só para este
// horário: a oferta e os outros horários não mudam.

import { db } from '../db/knex.js'
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from '../erros.js'
import { regrasDeAtribuicao as regras } from './dados.js'
import { copiarAtribuicoes } from './versoes.js'

async function exigirHorario(periodoId, versaoId, { paraEditar = false } = {}) {
  const versao = await db('versao_grade').where({ id: versaoId, periodo_id: periodoId }).first()
  if (!versao) throw new ErroNaoEncontrado('Horário não encontrado neste período')
  if (paraEditar && versao.publicada) {
    throw new ErroConflito(
      'O horário publicado não pode ser alterado; duplique-o para fazer ajustes'
    )
  }
  return versao
}

const chaveTD = (a) => `${a.turmaId}|${a.disciplinaId}`
const mesmaLista = (x, y) => JSON.stringify(x) === JSON.stringify(y)

// Atribuições do horário, com as aulas já alocadas e a comparação com a oferta.
export async function listarAtribuicoes(periodoId, versaoId) {
  await exigirHorario(periodoId, versaoId)
  const [doHorario, daOferta, aulas] = await Promise.all([
    regras.listar(periodoId, null, versaoId),
    regras.listar(periodoId, null, null),
    db('aula')
      .where({ versao_id: versaoId })
      .groupBy('atribuicao_id')
      .select('atribuicao_id', db.raw('COUNT(*) AS n')),
  ])
  const alocadas = new Map(aulas.map((a) => [a.atribuicao_id, Number(a.n)]))
  const oferta = new Map(daOferta.map((a) => [chaveTD(a), a]))
  const presentes = new Set(doHorario.map(chaveTD))

  const atribuicoes = doHorario.map((a) => {
    const base = oferta.get(chaveTD(a))
    const diferencas = []
    if (base) {
      if (base.aulasSemanais !== a.aulasSemanais) diferencas.push('aulas')
      if (base.tamanhoBloco !== a.tamanhoBloco) diferencas.push('bloco')
      if ((base.grupoParalelo ?? null) !== (a.grupoParalelo ?? null)) diferencas.push('grupo')
      if (!mesmaLista(base.professores, a.professores)) diferencas.push('professores')
    }
    return {
      ...a,
      aulasAlocadas: alocadas.get(a.id) ?? 0,
      naOferta: base
        ? {
            id: base.id,
            aulasSemanais: base.aulasSemanais,
            tamanhoBloco: base.tamanhoBloco,
            grupoParalelo: base.grupoParalelo,
            professoresDetalhe: base.professoresDetalhe,
          }
        : null,
      diferencas,
    }
  })
  // Da oferta, mas fora deste horário (tiradas ou criadas depois na oferta).
  const foraDoHorario = daOferta.filter((a) => !presentes.has(chaveTD(a)))
  return { atribuicoes, foraDoHorario }
}

async function linha(periodoId, versaoId, id) {
  const [registro] = await regras.listar(periodoId, id, versaoId)
  return registro
}

export async function atualizarAtribuicao(periodoId, versaoId, id, corpo) {
  await exigirHorario(periodoId, versaoId, { paraEditar: true })
  const dados = regras.esquema.parse(corpo)
  const resultado = await db.transaction((trx) =>
    regras.atualizar(trx, id, dados, periodoId, versaoId)
  )
  return { registro: await linha(periodoId, versaoId, id), ...resultado }
}

// Tira a disciplina deste horário, com as aulas dela.
export async function excluirAtribuicao(periodoId, versaoId, id) {
  await exigirHorario(periodoId, versaoId, { paraEditar: true })
  return db.transaction((trx) => regras.excluir(trx, id, periodoId, versaoId))
}

// Atribuição nova só deste horário (turma criada no semestre, disciplina extra...).
export async function criarAtribuicao(periodoId, versaoId, corpo) {
  await exigirHorario(periodoId, versaoId, { paraEditar: true })
  const { turmaId, disciplinaId, ...resto } = corpo ?? {}
  const dados = regras.esquema.parse(resto)
  const erros = []
  if (!Number.isInteger(turmaId)) erros.push({ campo: 'turmaId', mensagem: 'Escolha a turma' })
  if (!Number.isInteger(disciplinaId))
    erros.push({ campo: 'disciplinaId', mensagem: 'Escolha a disciplina' })
  if (erros.length) throw new ErroValidacao(erros)

  const id = await db.transaction(async (trx) => {
    const turma = await trx('turma').where({ id: turmaId, periodo_id: periodoId }).first('id')
    if (!turma)
      throw new ErroValidacao([{ campo: 'turmaId', mensagem: 'Turma não é deste período' }])
    const disciplina = await trx('disciplina').where({ id: disciplinaId }).first('id')
    if (!disciplina)
      throw new ErroValidacao([{ campo: 'disciplinaId', mensagem: 'Disciplina não encontrada' }])
    const professores = await trx('professor').whereIn('id', dados.professores).pluck('id')
    if (professores.length !== dados.professores.length) {
      throw new ErroValidacao([
        { campo: 'professores', mensagem: 'Há professor inexistente na lista' },
      ])
    }
    const repetida = await trx('atribuicao')
      .where({ versao_id: versaoId, turma_id: turmaId, disciplina_id: disciplinaId })
      .first('id')
    if (repetida) {
      throw new ErroConflito('Esta disciplina já está neste horário para a turma', [
        { campo: 'disciplinaId', mensagem: 'A turma já tem esta disciplina neste horário' },
      ])
    }
    const [novo] = await trx('atribuicao').insert({
      periodo_id: periodoId,
      versao_id: versaoId,
      turma_id: turmaId,
      disciplina_id: disciplinaId,
      aulas_semanais: dados.aulasSemanais,
      tamanho_bloco: dados.tamanhoBloco,
      grupo_paralelo: dados.grupoParalelo,
    })
    await trx('atribuicao_professor').insert(
      dados.professores.map((p) => ({ atribuicao_id: novo, professor_id: p }))
    )
    return novo
  })
  return { registro: await linha(periodoId, versaoId, id) }
}

// Traz para o horário atribuições da oferta que não estão nele.
export async function adicionarDaOferta(periodoId, versaoId, ids) {
  await exigirHorario(periodoId, versaoId, { paraEditar: true })
  return db.transaction(async (trx) => {
    const base = await trx('atribuicao')
      .where({ periodo_id: periodoId })
      .whereNull('versao_id')
      .whereIn('id', ids)
    if (base.length !== ids.length) {
      throw new ErroValidacao([], 'Há atribuição que não é da oferta deste período')
    }
    for (const a of base) {
      const existe = await trx('atribuicao')
        .where({ versao_id: versaoId, turma_id: a.turma_id, disciplina_id: a.disciplina_id })
        .first('id')
      if (existe) throw new ErroConflito('A disciplina já está neste horário para a turma')
    }
    const mapa = await copiarAtribuicoes(trx, periodoId, versaoId, null, ids)
    return { adicionadas: [...mapa.values()] }
  })
}

// Volta a atribuição do horário a ser igual à da oferta (aulas, bloco, grupo e professores).
export async function restaurarDaOferta(periodoId, versaoId, id) {
  await exigirHorario(periodoId, versaoId, { paraEditar: true })
  const atual = await db('atribuicao').where({ id, versao_id: versaoId }).first()
  if (!atual) throw new ErroNaoEncontrado('Atribuição não encontrada neste horário')
  const base = await db('atribuicao')
    .where({ periodo_id: periodoId, turma_id: atual.turma_id, disciplina_id: atual.disciplina_id })
    .whereNull('versao_id')
    .first()
  if (!base) throw new ErroConflito('Esta disciplina não está mais na oferta do período')
  const professores = await db('atribuicao_professor')
    .where({ atribuicao_id: base.id })
    .pluck('professor_id')
  return atualizarAtribuicao(periodoId, versaoId, id, {
    professores,
    aulasSemanais: base.aulas_semanais,
    tamanhoBloco: base.tamanho_bloco,
    grupoParalelo: base.grupo_paralelo,
  })
}
