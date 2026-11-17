#!/usr/bin/env node
// Exporta o problema de um período do banco para um arquivo JSON, para usar com
// scripts/resolver.js sem passar pela API.
//
//   node scripts/exportar-problema.js <periodoId> <arquivo.json> [--versao <id>]

import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { encerrarBanco } from '../src/db/knex.js'
import { montarProblema } from '../src/servicos/problema.js'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { versao: { type: 'string' } },
})
const [periodoId, arquivo] = positionals
if (!periodoId || !arquivo) {
  console.error('Uso: node scripts/exportar-problema.js <periodoId> <arquivo.json> [--versao <id>]')
  process.exit(1)
}

try {
  const { problema, avisos } = await montarProblema(Number(periodoId), {
    versaoId: values.versao ? Number(values.versao) : null,
  })
  writeFileSync(arquivo, JSON.stringify(problema, null, 2))
  for (const a of avisos) console.warn(`Aviso: ${a}`)
  console.log(
    `${problema.turmas.length} turmas, ${problema.professores.length} professores, ` +
      `${problema.atribuicoes.length} atribuições, ${problema.horarios.length} horários → ${arquivo}`
  )
} catch (erro) {
  console.error(erro.message)
  process.exitCode = 1
} finally {
  await encerrarBanco()
}
