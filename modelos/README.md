# Planilhas-modelo de importação

Os dados do semestre entram por **uma planilha de oferta** (`oferta.xlsx`): uma linha por disciplina de cada turma, com o professor.

| Coluna           | Obrigatória                                                                           | Exemplo                    |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| Semestre         | não (se vier, precisa ser o período escolhido)                                        | 2027.1                     |
| Turma            | sim                                                                                   | 1 TDS                      |
| Curso            | sim                                                                                   | Téc. Desenv. Sistemas      |
| Período          | não (indica o nível: "ano" = integrado, "período" = superior, "módulo" = subsequente) | 1º ano                     |
| Disciplina       | sim                                                                                   | Fundamentos de Programação |
| Aulas/semana     | sim                                                                                   | 4                          |
| Professor        | sim (dois professores: separe com vírgula ou "/")                                     | Maria da Silva             |
| Turno            | não (sem ele, a turma nova aceita todos os turnos)                                    | Matutino                   |
| Alunos           | não                                                                                   | 35                         |
| Tamanho do bloco | não (sem ele, blocos de 2 quando há 2 ou mais aulas)                                  | 2                          |
| Sigla            | não (sem ela, é gerada pelas iniciais)                                                | FP                         |

Como cada registro é reconhecido:

| Registro   | Chave                               |
| ---------- | ----------------------------------- |
| Professor  | nome                                |
| Disciplina | nome (ou a sigla, se a coluna vier) |
| Turma      | turma + curso + período             |
| Atribuição | turma + disciplina                  |

`salas.xlsx` continua disponível para cadastrar as salas, no mesmo envio da oferta ou separado. As planilhas antigas (`professores`, `disciplinas`, `turmas`, `atribuicoes`) ainda são aceitas, mas não podem ir junto com a oferta.

Os arquivos desta pasta são gerados a partir de `backend/src/importacao/planilhas.js`, que é a fonte única das colunas:

```bash
npm run modelos -w backend
```
