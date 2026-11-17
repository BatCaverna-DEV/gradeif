#!/usr/bin/env node
// F2-15 — Linha de comando do solver.
//
//   node scripts/resolver.js problema.json [opções]
//   node scripts/resolver.js --ficticio [opções]
//
// Opções:
//   --tempo <ms>        tempo limite (padrão: o do problema)
//   --iteracoes <n>     limite de iterações (resultado reproduzível com a semente)
//   --semente <texto>   semente do gerador aleatório
//   --saida <arquivo>   grava a solução completa em JSON
//   --violacoes <n>     quantas violações listar (padrão 20; 0 = todas)
//   --ficticio          usa o campus fictício em vez de um arquivo

import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { CATALOGO } from '../src/core/restricoes/catalogo.js'
import { ErroProblema, resolver } from '../src/core/index.js'
import { gerarProblemaFicticio } from './problema-ficticio.js'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tempo: { type: 'string' },
    iteracoes: { type: 'string' },
    semente: { type: 'string' },
    saida: { type: 'string' },
    violacoes: { type: 'string', default: '20' },
    ficticio: { type: 'boolean', default: false },
    ajuda: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.ajuda || (!positionals[0] && !values.ficticio)) {
  console.log(
    readFileSync(new URL(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 15)
      .join('\n')
      .replace(/^\/\/ ?/gm, '')
  )
  process.exit(values.ajuda ? 0 : 1)
}

const problema = values.ficticio
  ? gerarProblemaFicticio()
  : JSON.parse(readFileSync(positionals[0], 'utf8'))
problema.opcoes = { ...problema.opcoes }
if (values.tempo) problema.opcoes.tempoLimiteMs = Number(values.tempo)
if (values.iteracoes) problema.opcoes.maxIteracoes = Number(values.iteracoes)
if (values.semente) problema.opcoes.semente = values.semente

const escrever = (texto) => process.stderr.write(texto)

let solucao
try {
  solucao = resolver(problema, {
    aoProgresso(info) {
      if (info.etapa === 'construcao') {
        escrever(
          `Construção: ${info.blocos} blocos, ${info.pendentesAposConstrucao} sem lugar na primeira passada, ` +
            `${info.semLugarAposReparo} depois do reparo (${info.tempoMs} ms)\n`
        )
      } else {
        escrever(
          `\r${(info.tempoMs / 1000).toFixed(1)} s  iteração ${info.iteracao.toLocaleString('pt-BR')}  ` +
            `custo ${info.custoAtual}  melhor ${info.melhorCusto}   `
        )
      }
    },
  })
} catch (erro) {
  if (erro instanceof ErroProblema) {
    console.error(`\n${erro.message}`)
    for (const d of erro.detalhes) console.error(`  - ${d}`)
    process.exit(2)
  }
  if (erro.name === 'ZodError') {
    console.error('\nO arquivo não segue o formato do problema:')
    for (const i of erro.issues) console.error(`  - ${i.path.join('.')}: ${i.message}`)
    process.exit(2)
  }
  throw erro
}
escrever('\n\n')

console.log(`Semente: ${solucao.semente}`)
console.log(
  `Iterações: ${solucao.iteracoes.toLocaleString('pt-BR')} em ${(solucao.tempoMs / 1000).toFixed(1)} s (fim: ${solucao.motivoFim})`
)
console.log(`Aulas alocadas: ${solucao.aulas.length}`)
console.log(
  solucao.valida
    ? 'Grade válida: nenhuma restrição rígida violada.'
    : `Grade INVÁLIDA: ${solucao.custoRigido} violação(ões) rígida(s).`
)
console.log(`Pontuação (penalidade das flexíveis, menor é melhor): ${solucao.pontuacao}\n`)

console.table(
  CATALOGO.map((r) => ({
    código: r.codigo,
    restrição: r.nome,
    custo: solucao.pontuacaoPorRestricao[r.codigo] ?? '(inativa)',
  }))
)

if (solucao.naoAlocados.length) {
  console.log('\nAulas sem lugar:')
  for (const n of solucao.naoAlocados) {
    console.log(`  atribuição ${n.atribuicaoId}: faltam ${n.aulasFaltantes}`)
    for (const m of n.motivos) console.log(`    - ${m}`)
  }
}

const limite = Number(values.violacoes)
const listar = limite ? solucao.violacoes.slice(0, limite) : solucao.violacoes
if (listar.length) {
  console.log(`\nViolações (${listar.length} de ${solucao.violacoes.length}):`)
  for (const v of listar) console.log(`  ${v.codigo.padEnd(3)} ${v.mensagem}`)
}

if (values.saida) {
  writeFileSync(values.saida, JSON.stringify(solucao, null, 2))
  console.log(`\nSolução gravada em ${values.saida}`)
}
