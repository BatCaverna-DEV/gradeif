// F3-01 — Configuração das restrições por período (restricao_config).
// O catálogo (core/restricoes/catalogo.js) dá nomes, descrições e valores
// iniciais; o banco guarda o que o gestor mudou em cada período.

import { z } from 'zod'
import { db } from '../db/knex.js'
import { CATALOGO, TIPO, configuracaoInicial, obterRestricao } from '../core/restricoes/catalogo.js'
import { ErroNaoEncontrado, ErroValidacao } from '../erros.js'

const json = (v) => (typeof v === 'string' ? JSON.parse(v) : (v ?? null))
const inteiro = (min, max, rotulo) =>
  z
    .number({ error: `${rotulo} deve ser um número` })
    .int(`${rotulo} deve ser inteiro`)
    .min(min, `${rotulo}: mínimo ${min}`)
    .max(max, `${rotulo}: máximo ${max}`)

// Parâmetros aceitos por restrição. Restrições fora daqui não têm parâmetros.
export const PARAMETROS = {
  F3: z.strictObject({
    primeirosTempos: inteiro(1, 10, 'Tempos iniciais da manhã'),
    turnoNoite: z.number().int().positive().nullable().optional(),
    turnoManha: z.number().int().positive().nullable().optional(),
  }),
  F4: z.strictObject({ maximoPorDia: inteiro(1, 10, 'Máximo de aulas por dia') }),
  F7: z.strictObject({ aulasPorDia: inteiro(1, 20, 'Aulas por dia de referência') }),
  F9: z.strictObject({ maximoPorDia: inteiro(1, 20, 'Máximo de aulas por dia') }),
}

const Alteracao = z.strictObject({
  ativa: z.boolean().optional(),
  peso: inteiro(1, 10, 'Peso').optional(),
  parametros: z.record(z.string(), z.unknown()).nullable().optional(),
})

async function garantirPeriodo(periodoId, trx = db) {
  const periodo = await trx('periodo_letivo').where({ id: periodoId }).first()
  if (!periodo) throw new ErroNaoEncontrado('Período letivo não encontrado')
}

// Períodos antigos ou restrições novas no catálogo: cria as linhas que faltam.
async function garantirLinhas(periodoId, trx = db) {
  const existentes = new Set(
    (await trx('restricao_config').where({ periodo_id: periodoId }).select('codigo')).map(
      (r) => r.codigo
    )
  )
  const faltam = configuracaoInicial().filter((r) => !existentes.has(r.codigo))
  if (faltam.length) {
    await trx('restricao_config').insert(
      faltam.map((r) => ({
        periodo_id: periodoId,
        codigo: r.codigo,
        ativa: r.ativa,
        peso: r.peso,
        parametros: r.parametros ? JSON.stringify(r.parametros) : null,
      }))
    )
  }
}

function paraItem(r, linha) {
  const rigida = r.tipo === TIPO.RIGIDA
  return {
    codigo: r.codigo,
    tipo: r.tipo,
    nome: r.nome,
    descricao: r.descricao,
    ativa: !!linha.ativa,
    peso: rigida ? null : linha.peso,
    parametros: r.parametros ? { ...r.parametros, ...(json(linha.parametros) ?? {}) } : null,
    padrao: { peso: rigida ? null : r.peso, parametros: r.parametros ?? null },
  }
}

export async function listarRestricoes(periodoId) {
  await garantirPeriodo(periodoId)
  await garantirLinhas(periodoId)
  const linhas = await db('restricao_config').where({ periodo_id: periodoId })
  const porCodigo = new Map(linhas.map((l) => [l.codigo, l]))
  return CATALOGO.map((r) => paraItem(r, porCodigo.get(r.codigo)))
}

export async function atualizarRestricao(periodoId, codigo, dados) {
  const r = obterRestricao(codigo)
  if (!r) throw new ErroNaoEncontrado(`Restrição ${codigo} não existe`)
  const alteracao = Alteracao.parse(dados)
  const rigida = r.tipo === TIPO.RIGIDA
  if (rigida && alteracao.peso !== undefined) {
    throw new ErroValidacao(
      [{ campo: 'peso', mensagem: 'Restrição rígida não tem peso' }],
      'Restrição rígida não tem peso'
    )
  }

  let parametros
  if (alteracao.parametros !== undefined) {
    const esquema = PARAMETROS[codigo]
    if (!esquema) {
      throw new ErroValidacao(
        [{ campo: 'parametros', mensagem: `A restrição ${codigo} não tem parâmetros` }],
        `A restrição ${codigo} não tem parâmetros`
      )
    }
    const resultado = esquema.safeParse({ ...r.parametros, ...(alteracao.parametros ?? {}) })
    if (!resultado.success) {
      const detalhes = resultado.error.issues.map((i) => ({
        campo: ['parametros', ...i.path].join('.'),
        mensagem: i.message,
      }))
      throw new ErroValidacao(detalhes, detalhes[0].mensagem)
    }
    parametros = resultado.data
    for (const campo of ['turnoNoite', 'turnoManha']) {
      if (parametros[campo] == null) {
        delete parametros[campo]
        continue
      }
      const turno = await db('turno')
        .where({ id: parametros[campo], periodo_id: periodoId })
        .first()
      if (!turno) {
        throw new ErroValidacao(
          [{ campo: `parametros.${campo}`, mensagem: 'Turno não pertence ao período' }],
          'Turno não pertence ao período'
        )
      }
    }
  }

  await garantirPeriodo(periodoId)
  await garantirLinhas(periodoId)
  const mudancas = {}
  if (alteracao.ativa !== undefined) mudancas.ativa = alteracao.ativa
  if (alteracao.peso !== undefined) mudancas.peso = alteracao.peso
  if (parametros !== undefined) mudancas.parametros = JSON.stringify(parametros)
  if (Object.keys(mudancas).length) {
    await db('restricao_config').where({ periodo_id: periodoId, codigo }).update(mudancas)
  }
  const linha = await db('restricao_config').where({ periodo_id: periodoId, codigo }).first()
  return paraItem(r, linha)
}

// Volta todas as restrições do período aos valores do catálogo.
export async function restaurarPadrao(periodoId) {
  await garantirPeriodo(periodoId)
  await db.transaction(async (trx) => {
    await trx('restricao_config').where({ periodo_id: periodoId }).delete()
    await garantirLinhas(periodoId, trx)
  })
  return listarRestricoes(periodoId)
}
