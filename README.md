# Sistema de Horários — IFMA Campus Coelho Neto

Geração automática e ajuste manual da grade de horários do campus. A especificação está em `../descricao.md` e o plano de tarefas em `../tarefas.md`.

## Estrutura

```
horarios/
  backend/            API Node/Express + núcleo de regras e solver
    src/
      core/           regras, avaliação de custo e solver (sem banco nem HTTP)
      config/         variáveis de ambiente e logger
      db/             conexão Knex, migrations e seeds
      middlewares/    autenticação, validação Zod, tratamento de erros
      rotas/          rotas Express
      servicos/       regras de negócio que acessam o banco
    test/             testes Vitest
  frontend/           Vue 3 + bootstrap-vue-next + Pinia + Vue Router (Vite)
  modelos/            planilhas-modelo de importação
  docs/               decisões e manuais
```

O diretório `backend/src/core` corresponde ao pacote `core` da descrição. Ele não importa nada de banco, HTTP ou `process.env`, para poder rodar em `worker_threads` e ser testado só com JSON.

## Requisitos

- Node.js 22 ou superior (testado com 24)
- MariaDB 10.4 ou superior (em desenvolvimento, o do XAMPP serve)

## Primeira execução

```bash
npm install
```

```bash
cp backend/.env.example backend/.env
```

Crie a base no MariaDB, com o usuário e a senha definidos no `.env`:

```sql
CREATE DATABASE horarios CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
npm run migrate
```

```bash
npm run seed
```

O seed cria o usuário gestor definido por `GESTOR_EMAIL` e `GESTOR_SENHA` no `.env`. Troque a senha antes de qualquer uso real.

## Desenvolvimento

```bash
npm run dev
```

Sobe a API em `http://localhost:3333` e a interface em `http://localhost:5173`. O Vite encaminha `/api` para a API, então o cookie de sessão fica na mesma origem.

| Comando                                     | O que faz                                                     |
| ------------------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                               | API e interface juntas, com recarga automática                |
| `npm test`                                  | Testes do backend (Vitest)                                    |
| `npm run lint`                              | ESLint em todo o repositório                                  |
| `npm run format`                            | Prettier em todo o repositório                                |
| `npm run build`                             | Build de produção da interface em `frontend/dist`             |
| `npm run migrate`                           | Aplica migrations pendentes                                   |
| `npm run seed`                              | Executa os seeds                                              |
| `npm run resolver -w backend -- --ficticio` | Solver na linha de comando (ver `backend/src/core/README.md`) |

## Situação

A Fase 1 está completa no código. Falta o critério de aceite: os dados reais do campus entrarem por planilha sem ajuste manual no banco.

- F1-01 a F1-05: monorepo, lint, testes, esqueleto da API e da interface.
- F1-06 a F1-11: todas as migrations do modelo de domínio e o seed do gestor.
- F1-12 e F1-13: login, logout, sessão por cookie e guarda de rotas por perfil.
- F1-14: CRUD de período letivo e configuração de turnos e tempos de aula.
- F1-15 a F1-20: importação de planilhas com prévia, gravação tudo-ou-nada, histórico e impacto na grade.
- F1-21: tela de dados com consulta, busca e correção pontual dos cinco cadastros, num componente de tabela reutilizado.
- F0-05: planilhas-modelo em `modelos/`, geradas por `npm run modelos -w backend`.
- F2-01 a F2-09: formato do problema, grade em memória, as 18 restrições e o avaliador completo e incremental, com testes de cada regra.
- F2-10 a F2-15: solver (construção gulosa, reparo em cadeia, recozimento simulado) e linha de comando.
- F2-16: montador que exporta um período do banco para o problema (`GET /api/periodos/:id/problema` e `npm run exportar-problema -w backend`).

Falta a F2-17, que depende dos dados reais: comparar a grade gerada com a vigente, calibrar os pesos e decidir se o solver basta. Num campus fictício de 16 turmas e 352 aulas, o solver chega a uma grade válida em menos de 1 s e melhora as flexíveis por volta de 80 mil movimentos por segundo.

- F3-01 a F3-11: restrições por período (ativação, pesos e parâmetros), geração em `worker_threads` com progresso ao vivo por Server-Sent Events e cancelamento, gravação como versão, grade por turma, professor ou sala com painel de violações, tela de versões e painel do período com pendências.

- F4-01 a F4-11: editor manual. Ao escolher uma aula (clique ou arraste), cada célula fica verde, amarela ou vermelha conforme as regras, com o motivo ao passar o mouse. Soltar no vermelho pede confirmação; soltar sobre outra aula propõe a troca. Também: fixar e liberar, lista de aulas não alocadas, aulas para revisar depois de reimportação, desfazer e refazer (Ctrl+Z, Ctrl+Y), regeração mantendo as fixadas e comparação de duas versões.

- F5-01 a F5-11: publicação (uma versão por período), consulta pública sem login em `/consulta` (com link direto e lista por dia no celular), PDF por turma, professor, sala e consolidado do campus, planilha XLSX para o SUAP, disponibilidade clicável para gestor e professor, contas de professor, sessões no banco, roteiro de implantação, backup e manual do gestor.

- Horários com nome (tabela `versao_grade`), cada um com as próprias atribuições (`atribuicao.versao_id`; vazio = oferta do período). Cada horário também tem a própria disponibilidade (`indisponibilidade.versao_id`; vazio = padrão do período, informado pelos professores). Criar copia a oferta e o padrão, ou outro horário; mudar uma atribuição num horário não afeta a oferta nem os outros. A geração preenche um horário escolhido, mantendo as aulas fixadas dele.

Falta a F5-12, o teste de ponta a ponta com um período real, que depende dos dados do campus (assim como a F2-17).

## Documentação

| Documento                                                | Para quem                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| [docs/manual-do-gestor.md](docs/manual-do-gestor.md)     | Gestor: ciclo completo de um período, da importação à publicação     |
| [docs/implantacao.md](docs/implantacao.md)               | Quem instala: VPS, PM2, Apache com HTTPS e SSE, backup e restauração |
| [docs/decisoes.md](docs/decisoes.md)                     | Equipe: respostas do levantamento e decisões de implementação        |
| [backend/src/core/README.md](backend/src/core/README.md) | Equipe: restrições, avaliação e solver                               |

## Editor

A simulação (`POST .../versoes/:v/edicao/simular`) usa os mesmos módulos de restrição do solver, em modo incremental: para cada horário, mede o que muda se a aula for para lá. Ao mudar de horário, a aula fica com a sala atual se ela estiver livre e servir; senão, com a primeira sala compatível livre; sem nenhuma, fica sem sala e a R7 aponta.

- O banco não aceita duas aulas na mesma sala e horário. Mover para uma sala ocupada é recusado com a explicação; a simulação já evita isso escolhendo outra sala ou nenhuma.
- Mover uma aula para outro horário resolve a marcação de revisão.
- A versão publicada não pode ser editada: duplique-a.
- O histórico de desfazer vive na página; recarregar começa um histórico novo.

## Geração

O gerenciador fica em `backend/src/geracao`. Cada período tem no máximo uma geração em andamento; o estado fica em memória, então reiniciar a API interrompe a geração e esquece o último resultado mostrado na tela (as versões gravadas continuam no banco).

| Rota                                         | Função                                                |
| -------------------------------------------- | ----------------------------------------------------- |
| `POST /api/periodos/:id/geracao`             | Inicia (tempo limite, nome, semente, versão base)     |
| `GET /api/periodos/:id/geracao/eventos`      | Server-Sent Events com o estado do job                |
| `POST /api/periodos/:id/geracao/cancelar`    | Para; com `{ "salvar": true }` grava a melhor até ali |
| `GET /api/periodos/:id/versoes/:v/avaliacao` | Pontuação e violações com as regras e os pesos atuais |

Na implantação (F5-09), o proxy precisa repassar `/geracao/eventos` sem buffer. A API já envia `X-Accel-Buffering: no` e um comentário a cada 15 s para manter a conexão.

## Tela de dados

A fonte primária continua sendo a planilha, então a tela não cria registros. Ela lista, corrige um registro por vez e exclui quando nada depende dele.

- A tabela mostra indicadores do período: aulas atribuídas a cada professor contra a carga máxima, e aulas da turma contra os tempos dos turnos permitidos. Excessos aparecem em vermelho.
- Uma correção que afeta aulas já alocadas marca essas aulas para revisão, pela mesma regra da reimportação.
- A exclusão é recusada quando o registro está em uso: professor em atribuição, sala ou atribuição com aula alocada, e assim por diante. Para professores e salas, a alternativa é marcar como inativo.

## Importação

O código fica em `backend/src/importacao`:

| Arquivo            | Papel                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| `leitor.js`        | Lê CSV (vírgula, ponto e vírgula ou tabulação; UTF-8 ou Latin-1) e XLSX     |
| `planilhas.js`     | Colunas, sinônimos de cabeçalho, detecção do tipo e validação Zod por linha |
| `contexto.js`      | Cadastros atuais indexados pela chave de identificação                      |
| `classificacao.js` | Decide se cada linha cria, atualiza, fica igual ou é rejeitada              |
| `impacto.js`       | Encontra aulas já alocadas que a reimportação afeta                         |
| `oferta.js`        | Planilha de oferta: deduz professor, disciplina, turma e atribuição         |
| `previa.js`        | Junta tudo para um envio de até 5 arquivos, sem gravar                      |
| `gravacao.js`      | Refaz a prévia dentro de uma transação e grava                              |
| `modelos.js`       | Gera as planilhas-modelo com validação de célula                            |

Regras que valem para o usuário:

- A importação principal é a **planilha de oferta** (um arquivo por período; colunas em `modelos/README.md`). Professor e disciplina são reconhecidos pelo nome, e a turma por turma + curso + período.
- O que a oferta não traz fica com um padrão e é corrigido em **Dados**: SIAPE e e-mail, turno da turma (todos, com pendência no painel), alunos (0), tipo de ambiente (sala) e bloco (2 quando há 2 ou mais aulas). Reimportar não desfaz essas correções.
- A planilha de salas pode ir junto com a oferta. As planilhas antigas continuam aceitas, mas não junto com a oferta.
- Os arquivos de um envio podem vir em qualquer ordem. São processados na ordem salas, oferta, professores, disciplinas, turmas e atribuições.
- Uma linha rejeitada bloqueia o envio inteiro. Nada é gravado até a planilha ser corrigida.
- A confirmação reenvia os mesmos arquivos. O servidor refaz a prévia e só grava se ela continuar válida.
- Aulas afetadas por uma reimportação são marcadas com `revisar`, nunca apagadas.
