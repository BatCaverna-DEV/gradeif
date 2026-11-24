# Sincronização com o BatCaverna

Acompanhamento da funcionalidade que traz para o GradeIF os dados do BatCaverna:
professores, turmas e diários, estes últimos como atribuições.
Este documento diz o que já foi feito, o que falta e como continuar.

Última atualização: 24/11/2026.

## Situação em uma linha

As rotas de leitura do BatCaverna estão prontas no
[PR #15](https://github.com/BatCaverna-DEV/batcaverna/pull/15) (ainda não mesclado nem
publicado). No GradeIF ainda não há código da sincronização.

## Decisões tomadas

- **Sentido único:** BatCaverna → GradeIF. O BatCaverna é a referência de quem dá cada
  disciplina (os professores assumem os diários lá). Devolver dados ao BatCaverna fica
  para uma etapa opcional no fim.
- **Primeiro os endpoints, depois o consumo:** o BatCaverna expõe uma API de leitura com
  contrato escrito; o GradeIF consome essa API.
- **API, e não leitura direta do banco:** os dois sistemas estão no mesmo MySQL da VPS,
  mas a API isola o GradeIF das mudanças de esquema do BatCaverna (o `Diario` já perdeu
  `horario` e ganhou `plano`) e funciona igual localmente e na VPS.
- **Token de serviço:** cabeçalho `X-Integracao-Token`, valor em `INTEGRACAO_TOKEN`.
  Não reaproveita o JWT dos usuários do BatCaverna (expira em 1 h e pertence a uma pessoa).
  Quem chama é o backend do GradeIF; o token nunca vai ao navegador.
- **Uma fotografia por calendário:** a oferta inteira vem numa resposta só, para não
  misturar dados de momentos diferentes.
- **Textos crus:** o BatCaverna devolve os textos como estão no banco. Normalizar e
  comparar é papel do GradeIF (uma regra só, em `backend/src/importacao/texto.js`).
- **Inativos incluídos:** registros desativados vêm com o `status`, para o GradeIF
  distinguir "desativado" de "nunca existiu".

## Feito

### BatCaverna — PR #15 (branch `feat/integracao-gradeif`, commit `70182c0`)

Repositório `BatCaverna-DEV/batcaverna`, cópia local em `D:\Github\batcaverna`.

| Arquivo | O que é |
|---|---|
| `INTEGRACAO.md` | Contrato: formato JSON de cada resposta, token, status, exemplos |
| `batcaverna-back/helpers/integracao.js` | Middleware do token (`timingSafeEqual` sobre SHA-256) |
| `batcaverna-back/controllers/IntegracaoController.js` | As três rotas |
| `batcaverna-back/routes/integracao.js` | Registro das rotas |
| `batcaverna-back/index.js` | `app.use('/integracao', ...)` |
| `batcaverna-back/.env.example`, `batcaverna.md` | `INTEGRACAO_TOKEN` e documentação das rotas |

Rotas (todas `GET`, todas só de leitura):

| Rota | Devolve |
|---|---|
| `/integracao/v1/calendarios` | Calendários, do mais recente para o mais antigo |
| `/integracao/v1/calendarios/:id/oferta` | `{ geradoEm, calendario, cursos, turmas, diarios }`; cada diário com `professor: { id, siape, nome }` ou `null` |
| `/integracao/v1/professores` | `{ id, nome, siape, email, status, tipo, atualizadoEm }` de todos |

Respostas: 401 sem token ou com token errado; 503 sem `INTEGRACAO_TOKEN` configurado;
404 para calendário inexistente.

Testado localmente numa cópia do banco (`batcaverna_verif`, já apagada): calendário
2026.2 com 7 cursos, 34 turmas e 146 diários (45 com professor), 45 professores.

## Falta

### 1. Publicar o BatCaverna (com o Bruno)

- [ ] Revisar e mesclar o PR #15.
- [ ] Na VPS: `cd /root/github/batcaverna && git pull --ff-only`.
- [ ] Gerar o token (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
      pôr `INTEGRACAO_TOKEN=<token>` em `batcaverna-back/.env` e reiniciar o PM2
      `BATCAVERNA:3003`. **O token é segredo: só o Bruno o manipula.**
- [ ] Conferir se o banco de produção tem as colunas `professores.tipo` e `diarios.plano`
      (a cópia local não tinha; se faltar, `npm run db:alter` no back).
- [ ] Conferir se os acentos de produção estão corretos (na cópia local estão gravados
      como `?`, byte `3F`, no próprio banco).
- [ ] Testar na VPS: `curl -H "X-Integracao-Token: $INTEGRACAO_TOKEN" http://localhost:3003/integracao/v1/calendarios`.
- [ ] Ver se já existe o calendário 2027.1 no BatCaverna de produção (o GradeIF está no período 2027.1).

### 2. GradeIF — etapa de leitura (um PR)

Nada é gravado nesta etapa; serve para ver como os dados reais se casam.

- [ ] `BATCAVERNA_URL` (na VPS, `http://localhost:3003`) e `BATCAVERNA_TOKEN` no `.env`
      e no `.env.example` do backend.
- [ ] Cliente HTTP no servidor: `backend/src/integracao/batcaverna/cliente.js`
      (tempo limite, mensagem clara para 401/503/rede fora).
- [ ] Exemplo de resposta anonimizado em `backend/test/fixtures/batcaverna/`, no formato
      do `INTEGRACAO.md`, para os testes não dependerem do BatCaverna rodando.
- [ ] Correspondência (`correspondencia.js`), usando `chave()`/`normalizar()` de
      `importacao/texto.js`:
  - professor: SIAPE; sem SIAPE igual, nome normalizado (e propor corrigir o SIAPE);
  - turma: sugestão por curso + série/período + turno, a partir de `codigo` e `descricao`;
  - diário → atribuição: nome da disciplina normalizado, dentro da turma correspondente.
- [ ] Rotas do GradeIF só para gestor: listar calendários e montar a prévia de um calendário.
- [ ] Tela em Dados, "Dados do BatCaverna": escolher o calendário e ver turmas, diários
      e professores com o que casou, o que ficou sem par e os conflitos.
- [ ] Testes com o exemplo de resposta.

### 3. GradeIF — vínculos (um PR)

- [ ] Migração da tabela `vinculo_batcaverna`: `tipo` (periodo, turma, diario, professor),
      `externo_id` (UUID do BatCaverna), `local_id`, `periodo_id`, `ignorado`,
      `sincronizado_em`; único por (`tipo`, `externo_id`, `periodo_id`).
- [ ] Tela para ligar o calendário ao período e confirmar as turmas sugeridas, com
      opção "ignorar".
- [ ] A prévia passa a usar os vínculos salvos antes das sugestões.

### 4. GradeIF — gravação (um PR)

- [ ] Transformar a oferta do BatCaverna em linhas no formato da planilha de oferta e
      reaproveitar `classificarOferta` / `gravarOferta` (`backend/src/importacao/oferta.js`),
      a prévia/confirmação (`previa.js`, `gravacao.js`), o histórico (`importacao`) e a
      marcação "rever" (`impacto.js`). Verificar no início se o reaproveitamento cabe;
      se não couber, escrever um gravador próprio com as mesmas garantias.
- [ ] Destino: a oferta do período (`versao_id` nulo) ou um horário não publicado, como
      na importação (`horarioDeDestino` em `servicos/importacoes.js`).
- [ ] Regras de conflito (abaixo).
- [ ] Testes de banco (`*.banco.test.js`).

### 5. Opcional, depois

- [ ] Devolver ao BatCaverna o horário publicado de cada diário.
- [ ] Sincronização periódica ou aviso de "há mudanças desde a última sincronização"
      (usando `atualizadoEm`).

## Regras de conflito combinadas

| Dado | Quem vale |
|---|---|
| Professor de um diário que tem professor | BatCaverna |
| Diário sem professor | Mantém o professor do GradeIF e mostra um aviso |
| Atribuição com vários professores no GradeIF | Não sobrescrever; mostrar como conflito (o diário tem um professor só) |
| Aulas por semana | Proposta do BatCaverna, mostrada na prévia com o impacto; nada muda sem confirmação |
| Turnos, número de alunos, salas, aulas geminadas, grupo paralelo | Só o GradeIF; a sincronização não toca |
| Atribuição que só existe no GradeIF | Nunca apagada automaticamente; aparece listada |
| Registro inativo no BatCaverna | Mostrado como desativado; o gestor decide |

## Correspondência entre os sistemas

| BatCaverna | GradeIF | Observação |
|---|---|---|
| `professores` (UUID, `siape`, `nome`, `email`, `status` 1/2/3, `tipo`) | `professor` (`siape` único) | SIAPEs do BatCaverna são numéricos e únicos. No GradeIF há SIAPEs provisórios (`00000001`, `12121212`) e o "Sem Professor" sem SIAPE |
| `calendarios` ("Calendario - 2026.2", `ano`, `semestre`) | `periodo_letivo` ("2027.1") | Ligação escolhida pelo gestor |
| `cursos` (`descricao`, `categoria` 1 = 40 h, 2 = 20 h, 3 = superior) | `curso` (`nome`, `nivel`) | Nomes parecidos; casar por nome normalizado |
| `turmas` (`codigo`, `descricao`, `curso_id`, `calendario_id`) | `turma` (`codigo` curto, `chave_oferta`, `curso_id`) | Os códigos não batem ("20261.1.TDS.CNT.1191.1V" × "1º TDS"); precisa de vínculo confirmado |
| `diarios` (`descricao` = disciplina, `carga`, `aulas_semana`, `professor_id`, `turma_id`) | `atribuicao` (turma + `disciplina`, `aulas_semanais`) + `atribuicao_professor` | Um professor por diário × vários por atribuição |

## Cuidados com os dados do BatCaverna

Vistos na cópia local (calendário 2026.2); a produção pode estar diferente.

- **Turmas falsas:** 14 turmas de Automação Industrial cujo código é número de diário
  do SUAP (`142718 Língua Portuguesa I`), todas sem diários. Precisam de "ignorar".
- **Códigos repetidos:** três turmas do Bacharelado com o código `2026.2-BAD`. O UUID
  é que identifica.
- **Formatos de código variados:** `20261.1.TDS.CNT.1191.1V`, `ADS.REG.2026.1`,
  `20261.1.AII`, `2026.2-BAD`.
- **Textos sujos:** espaços sobrando no início e no fim (" Língua Portuguesa I ").
- **Aulas por semana:** o BatCaverna calcula `round(carga / 40)` na categoria 1 e
  `round(carga / 20)` nas demais, inclusive no superior (categoria 3).
- **Poucos diários com professor:** 45 de 146.

## Como continuar

1. Ver se o PR #15 foi mesclado e publicado:
   `git -C D:\Github\batcaverna log --oneline -3 origin/main` e, na VPS, o `curl` da seção 1.
2. Abrir este documento e seguir a próxima caixa não marcada.
3. A etapa de leitura do GradeIF pode começar antes da publicação, usando o exemplo de
   resposta em `backend/test/fixtures/batcaverna/`.
4. Para testar contra um BatCaverna local: copiar o banco para `batcaverna_verif`
   (`mysqldump batcaverna | mysql batcaverna_verif`), alinhar o esquema com
   `DB_NAME=batcaverna_verif node config/gerador.js --alter` em `batcaverna-back`, e subir
   o back com `PORTA`, `DB_NAME` e `INTEGRACAO_TOKEN` de teste no ambiente. Apagar a cópia no fim.
5. Ao concluir cada etapa, marcar as caixas aqui e atualizar a data no topo.
