// Solver: construção gulosa → reparo → recozimento simulado (descrição, seção 5).
// Problema entra (JSON do problema.js), solução sai (SolucaoSchema).

import { criarAleatorio } from '../aleatorio.js'
import { criarInstancia } from '../instancia.js'
import { construir, diagnosticar, reparar } from './construcao.js'
import { Estado } from './estado.js'
import { recozer } from './recozimento.js'

// opcoes extras (fora do JSON):
//   aoProgresso(info): chamado na construção e a cada ~500 ms da melhoria
//   deveParar(): devolve true para cancelar (checado a cada 256 iterações)
export function resolver(entrada, { aoProgresso, deveParar } = {}) {
  const inicio = performance.now()
  const inst = criarInstancia(entrada)
  const { opcoes } = inst.problema
  const rnd = criarAleatorio(opcoes.semente)
  const estado = new Estado(inst)

  const pendentes = construir(estado, rnd)
  const semLugar = reparar(estado, pendentes, rnd)
  aoProgresso?.({
    etapa: 'construcao',
    tempoMs: Math.round(performance.now() - inicio),
    blocos: estado.ativos.length,
    pendentesAposConstrucao: pendentes.length,
    semLugarAposReparo: semLugar.length,
    custoAtual: estado.av.custoTotal,
    rigido: estado.av.rigido,
    flexivel: estado.av.flexivel,
  })

  const melhoria = recozer(estado, rnd, opcoes, { inicio, aoProgresso, deveParar })

  const { aulas, posicao } = estado.grade.exportar()
  const relatorio = estado.av.relatorio(posicao)

  // Blocos fora da grade na melhor solução, agrupados por atribuição.
  const porAtribuicao = new Map()
  for (const b of estado.ativos) {
    if (b.h0 >= 0) continue
    const item = porAtribuicao.get(b.a) ?? {
      atribuicaoId: inst.problema.atribuicoes[b.a].id,
      aulasFaltantes: 0,
      motivos: diagnosticar(estado, b),
    }
    item.aulasFaltantes += b.tam
    porAtribuicao.set(b.a, item)
  }

  return {
    aulas,
    naoAlocados: [...porAtribuicao.values()],
    ...relatorio,
    semente: opcoes.semente,
    iteracoes: melhoria.iteracoes,
    tempoMs: Math.round(performance.now() - inicio),
    motivoFim: melhoria.motivoFim,
  }
}
