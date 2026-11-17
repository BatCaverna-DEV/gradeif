# Núcleo de regras e solver (`core`)

Este diretório equivale ao pacote `core` da descrição (seção 6): regras, avaliação de custo e solver em JavaScript puro.

**Regra de dependência:** nada aqui importa Knex, Express, `process.env` ou qualquer módulo de `../db`, `../rotas` ou `../servicos`. O núcleo recebe o problema pronto em memória (JSON validado por `problema.js`) e devolve uma solução. Isso permite testá-lo com arquivos JSON e executá-lo em `worker_threads` sem subir banco ou servidor.

| Arquivo                   | Tarefa       | Conteúdo                                                                  |
| ------------------------- | ------------ | ------------------------------------------------------------------------- |
| `problema.js`             | F2-01        | Esquemas Zod do problema e da solução                                     |
| `instancia.js`            | F2-01        | Problema validado e indexado por posição; aponta referências inexistentes |
| `grade.js`                | F2-02        | Grade em memória com índices por professor, turma, sala e atribuição      |
| `restricoes/catalogo.js`  | seção 4      | Códigos, descrições, pesos e parâmetros iniciais de R1–R8 e F1–F10        |
| `restricoes/index.js`     | F2-03        | Interface comum de restrição e registro por código                        |
| `restricoes/rigidas.js`   | F2-04, F2-05 | R1 a R8                                                                   |
| `restricoes/flexiveis.js` | F2-06, F2-07 | F1 a F10                                                                  |
| `avaliador.js`            | F2-08        | Soma de custos, modo completo e incremental                               |
| `aleatorio.js`            | F2-10        | Gerador com semente (cyrb128 + sfc32)                                     |
| `solver/estado.js`        | F2-10        | Blocos geminados, domínio de cada bloco, jornal para desfazer             |
| `solver/construcao.js`    | F2-11, F2-12 | Construção gulosa, reparo em cadeia e diagnóstico de blocos sem lugar     |
| `solver/movimentos.js`    | F2-13        | Mover bloco, trocar dois blocos da turma, trocar sala                     |
| `solver/recozimento.js`   | F2-14        | Recozimento simulado com tempo ou iterações, melhor solução e progresso   |
| `index.js`                |              | `resolver(problema)` e `avaliarGrade(problema, aulas)`                    |

## Interface de uma restrição

```js
{
  codigo: 'R1',
  escopo: 'professor', // ou 'turma', 'sala', 'atribuicao'
  custo(grade, r, config),      // custo sem peso de uma unidade do escopo
  violacoes(grade, r, config),  // a mesma avaliação, descrita
}
```

O custo da grade é a soma do custo de cada unidade. Um movimento só recalcula as unidades que tocou: as atribuições, turmas e professores das aulas movidas e as salas de origem e destino. O teste `solver.test.js` confere, depois de milhares de movimentos aleatórios, que o resultado incremental é igual ao da avaliação completa.

## Pontuação

- Rígidas contam sem peso (`custoRigido`). A grade é válida quando esse total é zero.
- Flexíveis são multiplicadas pelo peso de `restricao_config` (`pontuacao`). Menor é melhor.
- No recozimento, o custo é `custoRigido × 1000 + pontuacao`, de modo que nenhuma soma de flexíveis compensa uma rígida.

## Definições que não estão na descrição

| Código | Como é medida                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| R2     | Atribuições da mesma turma com o mesmo `grupoParalelo` podem ocupar o mesmo horário; a capacidade exigida (R7) é dividida entre elas.        |
| R7     | Se o problema tem salas, aula sem sala também viola.                                                                                         |
| F1     | Em cada dia, sequências de tempos seguidos da atribuição; aulas que não completam bloco contam, descontada a sobra natural.                  |
| F2, F6 | Tempos vagos entre a primeira e a última aula de cada turno e dia.                                                                           |
| F3     | Aula à noite no dia d e num dos `primeirosTempos` (2) da manhã do dia d + 1. Turnos reconhecidos pelo nome ou por `turnoNoite`/`turnoManha`. |
| F5     | Indisponibilidade não rígida de professor. A de turma e sala não tem efeito.                                                                 |
| F7     | Dias com aula menos o mínimo necessário (aulas da semana ÷ `aulasPorDia`, padrão 6).                                                         |
| F8     | Dias com aula abaixo do ideal (um bloco por dia, até o número de dias letivos).                                                              |
| F10    | Salas do mesmo tipo usadas pela turma no turno e dia, menos uma. Laboratório e quadra não contam.                                            |

## Linha de comando

```bash
npm run resolver -w backend -- --ficticio --iteracoes 200000
```

```bash
npm run exportar-problema -w backend -- 1 problema.json
```

```bash
npm run resolver -w backend -- problema.json --tempo 30000 --saida solucao.json
```

Com `--iteracoes` e `--semente` iguais, o resultado se repete. Só com tempo limite, depende da velocidade da máquina.
