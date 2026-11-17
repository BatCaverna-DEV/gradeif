# Decisões e respostas do levantamento (F0-01)

Registre aqui as respostas às perguntas em aberto da seção 10 de `descricao.md`. Cada resposta que muda o esquema do banco deve apontar a migration afetada.

| #   | Pergunta                                                                  | Resposta | Impacto                                             |
| --- | ------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| 1   | Quantas turmas, professores e salas o campus tem por período?             |          | dimensionamento do solver                           |
| 2   | Quais turnos funcionam, quantos tempos por turno e duração de cada tempo? |          | `turno`, `horario`                                  |
| 3   | Há aulas aos sábados letivos na grade regular?                            |          | `horario.dia_semana`                                |
| 4   | Integrado anual e superior semestral convivem no mesmo período?           |          | `periodo_letivo`                                    |
| 5   | Existem turmas divididas ou disciplinas com dois professores?             |          | `atribuicao.grupo_paralelo`, `atribuicao_professor` |
| 6   | Cada turma tem sala fixa ou a sala é escolhida aula a aula?               |          | restrição F10                                       |
| 7   | Quais relatórios do SUAP podem ser exportados e em que formato?           |          | importação                                          |
| 8   | Há dia reservado sem aula (reunião, planejamento)?                        |          | `indisponibilidade` de turma                        |
| 9   | O sistema ficará na VPS Hostinger ou em infraestrutura do IFMA?           |          | F5-09                                               |
| 10  | Professores terão login próprio para informar disponibilidade?            |          | `usuario.perfil`                                    |
| 11  | Existe a planilha da grade do período atual para caso de teste?           |          | F0-06                                               |

## Decisões de implementação já tomadas

- 09/11/2026 — Repositório dividido em `backend/` (API Express + núcleo de regras em `backend/src/core`) e `frontend/` (Vue 3). O núcleo permanece sem dependência de banco ou HTTP, como previsto para o pacote `core`.
- 09/11/2026 — `turno` e `horario` pertencem a um `periodo_letivo`, para permitir mudança de grade horária entre períodos sem afetar versões antigas.
- 09/11/2026 — `professor`, `disciplina`, `sala` e `curso` são cadastros globais (não dependem do período); `turma` e `atribuicao` pertencem ao período.
- 09/11/2026 — Leitura de XLSX com ExcelJS em vez de SheetJS. O pacote `xlsx` do npm está parado numa versão com alertas de segurança, e a versão corrigida só é distribuída fora do npm. O ExcelJS já estava previsto para a exportação, então a stack fica com uma biblioteca a menos.
- 09/11/2026 — O ExcelJS 4.4 depende de `uuid` 8, que tem um alerta moderado nas funções v3, v5 e v6. O ExcelJS só usa a v4, então o alerta não se aplica. Rever quando sair uma versão nova do ExcelJS.
- 09/11/2026 — Importação tudo-ou-nada por envio, não por arquivo. Uma linha rejeitada em qualquer arquivo bloqueia todos, porque atribuições dependem de turmas e professores do mesmo envio.
- 09/11/2026 — A prévia tem uma quarta situação, `inalterada`, além de criar, atualizar e rejeitar. Reimportar uma planilha igual não gera gravação nem histórico.
- 09/11/2026 — Tipo de ambiente de sala e disciplina é gravado normalizado (minúsculo, sem acento) para que a restrição R7 compare os dois lados sem ambiguidade.
- 09/11/2026 — Toda conexão com o MariaDB usa `time_zone = '+00:00'`. O servidor do XAMPP usa a hora local, e o driver lê as datas como UTC.
- 09/11/2026 — A tela de dados (F1-21) não cria registros, porque a planilha é a fonte primária. Ela corrige e exclui. Exclusões que apagariam aulas da grade em silêncio são recusadas.
- 09/11/2026 — Salvar a grade horária preserva turnos (pelo nome) e horários (por turno, dia e ordem). Antes, tudo era recriado com ids novos, o que deixaria turmas apontando para turnos inexistentes e apagaria indisponibilidades. Remover ou renomear turno usado por turma é recusado.
- 09/11/2026 — Cada restrição avalia uma unidade do seu escopo (professor, turma, sala ou atribuição). A avaliação incremental recalcula só as unidades tocadas por um movimento, e um teste confere a equivalência com a avaliação completa.
- 09/11/2026 — Pontuação separada em `custoRigido` (rígidas sem peso; grade válida quando zero) e `pontuacao` (flexíveis ponderadas). No recozimento, cada unidade rígida vale 1000, e a temperatura inicial é limitada a 50 para a busca não desmontar a grade construída.
- 09/11/2026 — O solver aloca blocos geminados inteiros em tempos seguidos do mesmo turno e dia. Um bloco que não cabe nem com reparo em cadeia é dividido em aulas avulsas, e a F1 cobra a separação. O que sobrar é relatado com as regras que impedem cada posição.
- 09/11/2026 — F10 conta só troca entre salas do mesmo tipo. Ir ao laboratório ou à quadra é exigência da disciplina e não deve pesar contra a grade.
- 09/11/2026 — Indisponibilidade não rígida (preferência) só tem efeito para professor (F5). A de turma e de sala é ignorada até haver uma restrição para ela.
- 09/11/2026 — Resultado reproduzível exige semente e limite de iterações iguais. Só com tempo limite, o resfriamento acompanha o relógio e o resultado varia com a máquina.
- 09/11/2026 — Professores e salas inativos ficam fora do problema. Atribuição sem nenhum professor ativo fica de fora com aviso.
- 10/11/2026 — Geração em `worker_threads` com um job por período e estado em memória. O cancelamento usa um `SharedArrayBuffer` que o solver consulta a cada 256 iterações. Há duas formas de parar: "encerrar e salvar" grava a melhor grade até ali, e "cancelar" descarta.
- 10/11/2026 — O progresso vai à interface por Server-Sent Events. Cada evento leva o estado completo do job, e não só a diferença, para que reconectar nunca deixe a tela inconsistente.
- 10/11/2026 — Ao gravar uma solução com duas aulas na mesma sala e horário, a segunda aula fica sem sala. O índice único do banco recusaria a gravação, e a pendência aparece como R7 na avaliação.
- 10/11/2026 — A avaliação de uma versão usa as regras e os pesos atuais e inclui professores e salas inativos. Assim, uma versão antiga continua avaliável depois de mudanças nos cadastros. A pontuação gravada na geração fica como histórico.
- 10/11/2026 — Migration 007: `versao_grade.custo_rigido` e `versao_grade.detalhes`, com iterações, tempo, aulas sem lugar, avisos e a versão de origem da cópia.
- 10/11/2026 — A Fase 3 começou antes da F2-17 (avaliação com dados reais), a pedido. O ponto de decisão sobre o solver continua valendo quando os dados reais chegarem.
- 10/11/2026 — O editor move aulas individuais, não blocos. Separar uma geminada é permitido, e a F1 mostra o custo. Assim o gestor pode resolver um caso pontual sem desmontar o bloco inteiro.
- 10/11/2026 — Cores do editor: vermelho quando alguma restrição rígida piora, mesmo que outra melhore; amarelo quando a soma das flexíveis piora; verde no resto. Os motivos listam primeiro as rígidas.
- 10/11/2026 — Troca de duas aulas: cada uma fica com a própria sala se ela estiver livre no novo horário; senão, fica com a sala da outra, que acabou de sair dali. No mesmo horário, a troca é só de salas.
- 10/11/2026 — Desfazer e refazer ficam no navegador, como pares de operações na API. Remover e recriar uma aula muda o id dela, e o histórico reaponta o id antigo para o novo.
- 10/11/2026 — Toda edição recalcula a avaliação com as regras atuais e grava pontuação e custo rígido na versão, para a lista de versões refletir o estado editado.
- 14/11/2026 — Sessões no MariaDB (tabela `sessao`, migration 008), com armazém próprio em `db/sessoes.js` em vez de um pacote externo. Reiniciar a API não desconecta ninguém. Desativar uma conta, trocar a senha ou mudar o perfil encerra as sessões abertas dela.
- 14/11/2026 — Publicar uma versão inválida exige uma segunda confirmação (`forcar`). A avaliação é refeita com os dados atuais na hora de publicar, e a publicação muda o período para "publicado".
- 14/11/2026 — A consulta pública só expõe o que já vai para o mural: siglas, nomes, turmas, salas e horários. SIAPE, e-mail, carga e disponibilidade ficam de fora.
- 14/11/2026 — PDF com pdfmake 0.3 no servidor, restrito às fontes Roboto do próprio pacote, sem acesso a URL externa nem a outros arquivos locais. Uma página por recurso, A4 paisagem.
- 14/11/2026 — Uma conta por professor, vinculada ao cadastro. O professor só lê e altera a própria disponibilidade; a grade dele é a consulta pública já filtrada.
- 14/11/2026 — Na implantação, a API serve o build do Vue (`FRONTEND_DIST`) e o Apache só faz HTTPS e proxy. O PM2 roda uma instância só, porque os jobs de geração ficam em memória.
- 15/11/2026 — A importação passa a ser por uma planilha de oferta (Semestre, Turma, Curso, Período, Disciplina, Aulas/semana, Professor), no lugar das cinco planilhas separadas. A oferta não traz SIAPE nem sigla, então professor e disciplina são reconhecidos pelo nome, e a sigla é gerada pelas iniciais (FP, DSWII, IHC). Migration 009: `professor.siape` opcional.
- 15/11/2026 — Turma reconhecida por turma + curso + período (`turma.chave_oferta`), porque o mesmo rótulo pode reunir cursos diferentes ("Outros Int" com Automação e Administração). Quando o rótulo se repete, a segunda turma ganha o curso no código: "Outros Int (Técnico em Administração)".
- 15/11/2026 — Sem a coluna Turno, a turma nova aceita todos os turnos e fica com `turnos_definidos = false`. O painel aponta a pendência como impeditiva até o gestor salvar o turno em Dados.
- 15/11/2026 — O nível do curso é deduzido do período ("ano" = integrado, "período" ou "semestre" = superior, "módulo" = subsequente) ou, sem ele, do nome (começa com "Téc." = integrado). Disciplina nova com 2 ou mais aulas usa blocos de 2.
- 15/11/2026 — Atribuições do período que não estão no arquivo de oferta não são apagadas: a prévia avisa e o gestor exclui em Dados. Apagar automaticamente arriscaria perder aulas por causa de uma linha esquecida.
- 15/11/2026 — As planilhas separadas continuam aceitas, para não quebrar quem já as usa; a de salas é a forma de cadastrar salas. Misturar a oferta com as de professores, disciplinas, turmas ou atribuições no mesmo envio é recusado.
- 16/11/2026 — "Horário" é o cenário nomeado da grade (tabela `versao_grade`, antes chamada de versão na interface). Cada horário tem as próprias atribuições (`atribuicao.versao_id`, migration 010). As atribuições sem horário são a oferta do período: a importação e Dados mexem só nelas, e elas servem de base para novos horários.
- 16/11/2026 — A unicidade turma + disciplina vale dentro de cada escopo (oferta ou um horário), com uma coluna calculada `escopo = IFNULL(versao_id, 0)`, porque o MariaDB não compara NULL em índice único.
- 16/11/2026 — Reimportar a oferta ou corrigi-la em Dados não altera horários existentes; a tela de atribuições do horário mostra o que difere da oferta e permite voltar a ela, atribuição por atribuição. Por isso a marcação "para revisar" por mudança de atribuição deixa de vir da importação; continua para mudanças de turma, disciplina e sala (cadastros compartilhados) e para edições no próprio horário.
- 16/11/2026 — A geração deixa de criar uma versão nova a cada execução: ela preenche o horário escolhido, mantendo as aulas fixadas e substituindo as demais. Para guardar uma grade antes de gerar de novo, duplica-se o horário. A opção "manter aulas fixadas de outra versão" saiu, porque cada horário tem atribuições próprias.
- 16/11/2026 — A disponibilidade passa a ser de cada horário (`indisponibilidade.versao_id`, migration 011), porque pode mudar de proposta para proposta. Sem horário fica o padrão do período: o que os professores informam pela conta deles, copiado para cada horário novo (e a cópia de um horário leva a disponibilidade dele). O professor só altera o padrão; a de cada horário é do gestor.
- 16/11/2026 — Professores podem ser cadastrados à mão em Dados (os demais cadastros continuam vindo da planilha). O nome não pode repetir o de outro professor, sem diferenciar acento e maiúscula, nem no cadastro nem na correção, porque a oferta reconhece o professor pelo nome.
- 16/11/2026 — Turmas podem ser cadastradas à mão (Dados ou tela de atribuições do horário). A turma pertence ao período (semestre) e vale para todos os horários dele; o que é de cada horário são as atribuições, e a tela do horário permite criar atribuições novas só para ele. Turma manual não tem chave da oferta; se a oferta trouxer depois o mesmo código, a importação passa a reconhecê-la.
- 16/11/2026 — Disciplinas podem ser cadastradas à mão (Dados ou dentro da nova atribuição do horário). Sem sigla, ela é gerada pelas iniciais, como na oferta. Sigla e nome são únicos sem diferenciar acento e maiúscula, no cadastro e na correção.
