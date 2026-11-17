// Gera as cinco planilhas-modelo em horarios/modelos (tarefa F0-05).
// Uso: npm run modelos -w backend
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { TIPOS } from '../src/importacao/planilhas.js'
import { gerarModelo, NOMES_ARQUIVO } from '../src/importacao/modelos.js'

const destino = fileURLToPath(new URL('../../modelos/', import.meta.url))
await mkdir(destino, { recursive: true })

for (const tipo of TIPOS) {
  const caminho = `${destino}${NOMES_ARQUIVO[tipo]}`
  await writeFile(caminho, await gerarModelo(tipo))
  console.log(`gerado ${caminho}`)
}
