# Manual do gestor (F5-11)

Este manual mostra o ciclo completo de um período letivo, da criação à publicação da grade. Os passos seguem a ordem do menu lateral. O **Painel do período** mostra em que etapa você está e o que ainda impede uma grade válida.

## 1. Criar o período e a grade horária

1. Em **Períodos letivos**, crie o período (por exemplo, `2027.1`) com as datas de início e fim.
2. Escolha o período no seletor do topo da tela. Todas as telas trabalham sobre o período escolhido ali.
3. Em **Turnos e tempos de aula** (pelo painel ou pela lista de períodos), defina os dias letivos, os turnos e os horários de cada tempo. Num período novo, a tela já vem preenchida com a configuração atual do campus (Matutino e Vespertino com 6 tempos, Noturno com 5, intervalo depois do 3º tempo); confira e clique em **Salvar grade horária**.

Dá para ajustar turnos e tempos depois, enquanto o período não tiver versões de grade. Turnos usados por turmas não podem ser removidos nem renomeados.

## 2. Importar os dados

Em **Importação**, envie a **planilha de oferta** do semestre: uma linha por disciplina de cada turma, com as colunas Semestre, Turma, Curso, Período, Disciplina, Aulas/semana e Professor. O modelo pode ser baixado na própria tela. CSV separado por ponto e vírgula e XLSX são aceitos.

- A prévia mostra, linha a linha, o que será criado: professores, disciplinas (com a sigla gerada), turmas e cursos.
- Uma linha rejeitada bloqueia o envio inteiro. Corrija a planilha e envie de novo.
- Reimportar a oferta corrigida não duplica nada. Professor e disciplina são reconhecidos pelo nome, e a turma por turma + curso + período.
- Atribuições que saíram da oferta não são apagadas: a prévia lista quais são, e você as exclui em **Dados**.
- Para cadastrar as salas, envie junto a planilha de salas (modelo na mesma tela).
- **Importar em:** escolha um horário para que a planilha, além de atualizar a oferta do período, gere as atribuições **daquele horário**. Disciplinas que o horário ainda não tem entram nele; as que já tem recebem as aulas e os professores da planilha. O tamanho do bloco ajustado no horário é mantido, a menos que a planilha traga a coluna. Atribuições do horário que não estão no arquivo ficam como estão. A prévia mostra o resumo do horário e o filtro **Mudam no horário**. Escolha "Só a oferta do período" para não mexer em nenhum horário. Na tela de atribuições do horário, o botão **Importar planilha** já abre a importação com ele escolhido. Horário publicado não recebe importação.

**Planilha de professores** (modelo na mesma tela): colunas Nome, SIAPE, E-mail e Carga máxima semanal; só o Nome é obrigatório, com ao menos uma das outras. Envie-a sozinha, depois da oferta. Cada linha é reconhecida pelo SIAPE ou, sem ele, pelo nome (sem diferenciar acento e maiúscula), então ela completa o cadastro de quem veio da oferta sem duplicar ninguém. Um SIAPE diferente do cadastrado é corrigido, com aviso na prévia; o SIAPE de um professor com o nome de outro é recusado. Quem não existe ainda é cadastrado.

Depois da primeira importação, complete em **Dados** o que a oferta não traz:

- o **turno** de cada turma (o painel lista as turmas com "turno a definir");
- o número de alunos e o SIAPE e o e-mail dos professores;
- o tipo de ambiente das disciplinas de laboratório;
- o tamanho do bloco (aulas geminadas), se não for 2.

**Turma dividida** (metade no laboratório, metade em sala): cadastre duas atribuições da mesma turma com o mesmo **grupo paralelo**. Elas podem ocorrer no mesmo horário, e cada metade só precisa de sala para metade dos alunos.

## 3. Conferir os dados

Em **Dados**, confira e corrija um registro por vez:

- professores com mais aulas que a carga máxima (em vermelho);
- turmas com mais aulas que tempos nos turnos;
- professores e salas que não devem entrar na geração, marcando-os como inativos.

O **Painel do período** lista as pendências que impedem uma grade válida, como uma atribuição sem sala compatível em tipo e capacidade. Resolva o que estiver marcado como _impede_ antes de gerar.

**Professor novo** (um substituto, por exemplo): em **Dados**, aba Professores, use **Novo professor**. SIAPE e e-mail são opcionais; o nome não pode repetir o de outro professor, porque a planilha de oferta reconhece o professor pelo nome. Depois ele aparece para escolha nas atribuições dos horários.

**Cor do professor**: cada professor tem uma cor, e as aulas dele aparecem nela na grade, no editor e na consulta pública, com uma legenda abaixo da grade. A cor é automática; para trocar, em **Dados** > Professores clique em **Corrigir** e use **Escolher cor** (ou **Usar automática** para voltar).

**Disciplina nova**: em **Dados**, aba Disciplinas, use **Nova disciplina**, ou o link "Cadastre a disciplina" dentro da **Nova atribuição** de um horário (ela volta já escolhida). Sem sigla, o sistema gera pelas iniciais do nome. Sigla e nome não podem repetir os de outra disciplina, porque a planilha de oferta reconhece a disciplina pelo nome.

## 4. Disponibilidade

A disponibilidade é de cada **horário**: um professor pode estar livre na segunda numa proposta e indisponível em outra. Em **Disponibilidade**, escolha no topo o horário e, à esquerda, o professor, a turma ou a sala. Depois clique nos tempos de aula. Cada clique avança um estado:

- **livre**;
- **prefere evitar** (amarelo, só para professor): o solver tenta não usar o tempo;
- **indisponível** (vermelho): o solver nunca usa o tempo.

Clique no nome do dia ou do turno para marcar todos os tempos dele. Use a disponibilidade da turma para um dia reservado sem aula, como o de reunião pedagógica.

O **padrão do período** (última opção do seletor) é o que os professores informam pela conta deles (seção 12). Todo horário novo começa com uma cópia dele; depois, cada horário segue o seu caminho. No horário, **Usar o padrão** traz de novo o que está no padrão para o recurso aberto. A lista mostra quantas marcações cada professor tem no horário escolhido.

O horário publicado não tem a disponibilidade alterada.

## 5. Restrições

Em **Restrições**, ajuste o que o solver deve priorizar.

- **Rígidas (R1 a R8):** toda grade válida cumpre. Desative uma só quando a regra não se aplicar ao campus.
- **Flexíveis (F1 a F10):** peso de 1 a 10. Peso alto é quase obrigatório; peso 1 serve só de desempate.
- Algumas têm parâmetros, como o máximo de aulas por dia da disciplina (F4) e do professor (F9).

**Restaurar valores iniciais** volta tudo ao padrão.

## 6. Criar os horários

Em **Horários**, clique em **Novo horário** e dê um nome (por exemplo, "Proposta com TDS à tarde"). Crie quantos quiser: cada horário é uma proposta independente.

- **Começar de:** a oferta do período (atribuições importadas) ou a cópia de outro horário, com as aulas dele.
- Em **Atribuições** (na lista ou na tela do horário), ajuste cada disciplina **só neste horário**: professor, aulas por semana, tamanho do bloco e grupo paralelo. A oferta e os outros horários não mudam.
- A coluna **Comparado à oferta** mostra o que difere ("difere: professores, aulas"). No formulário, **Voltar ao que está na oferta** desfaz a mudança.
- **Excluir** tira a disciplina deste horário, com as aulas dela. A lista **Da oferta, fora deste horário** permite trazê-la de volta.
- **Nova turma** (no horário ou em Dados > Turmas): a turma é do semestre e aparece em todos os horários dele. Depois de cadastrá-la, o sistema já abre **Nova atribuição** para incluir as disciplinas dela.
- **Nova atribuição**: inclui neste horário uma disciplina para uma turma, com professores, aulas, bloco e grupo. Ela vale só para este horário e aparece como "só neste horário".
- Reimportar só a oferta não altera os horários já criados: disciplinas novas na oferta aparecem na lista "fora deste horário" de cada um. Para levar a planilha direto a um horário, importe com ele escolhido em **Importar em** (seção 2).

## 7. Gerar o horário

Em **Geração** (ou **Gerar** na lista de horários), escolha o horário e o tempo limite e clique em **Gerar o horário**. Dá para criar um horário novo ali mesmo.

- A tela mostra o andamento ao vivo: movimentos testados e a melhor grade até agora.
- **Encerrar agora e salvar** guarda a melhor grade encontrada até o momento.
- **Cancelar sem salvar** descarta a geração e deixa o horário como estava.
- Gerar de novo um horário substitui as aulas que não estão fixadas. Para guardar a grade atual, **duplique** o horário antes.

Comece com 1 ou 2 minutos. Se a pontuação ainda estiver caindo no fim, gere de novo com mais tempo.

## 7.1. Analisar o horário

Abra o horário (pela geração ou por **Horários**) e veja a grade por turma, professor ou sala.

- **Válida** significa que nenhuma regra rígida foi violada. A **pontuação** soma as penalidades das flexíveis: quanto menor, melhor.
- O painel de **violações** lista cada problema. Clique num item para ver na grade as aulas envolvidas.
- Aulas que ficaram sem lugar aparecem como R4, com o motivo.

## 8. Ajustar à mão

Em **Editar** (no horário) ou **Editor de grade** (no menu):

1. Clique numa aula ou comece a arrastá-la. As células ficam **verdes** (livre), **amarelas** (viola regra flexível) ou **vermelhas** (viola regra rígida). Passe o mouse para ver o motivo.
2. Clique na célula de destino ou solte a aula nela. No vermelho, o sistema pede confirmação.
3. Soltar uma aula sobre outra propõe a **troca** entre as duas.

Outras ações:

- **🔒 Fixar:** a aula fica onde está nas próximas gerações. Depois, **Regenerar o resto** gera o horário de novo, mantendo as fixadas e realocando o restante.
- **Tirar da grade:** a aula vai para a lista **Não alocadas**, de onde pode ser arrastada de volta.
- **Desfazer** e **refazer** (Ctrl+Z e Ctrl+Y) cobrem toda a sessão de edição. Recarregar a página começa um histórico novo.

Para guardar o horário gerado sem alterações, **duplique-o** em **Horários** antes de editar.

## 9. Comparar horários

Em **Horários**, use **Comparar horários**. As duas grades aparecem lado a lado, com as aulas que mudaram destacadas. As turmas com mudança aparecem listadas no topo.

## 10. Publicar e divulgar

Em **Horários**, clique em **Publicar** no horário escolhido.

- Só um horário fica publicado por período. Publicar outro tira o anterior.
- Um horário com violações rígidas ou aulas sem lugar só é publicado depois de uma segunda confirmação.
- O horário publicado não pode ser editado, regerado nem excluído. Para corrigir, duplique, ajuste a cópia e publique a cópia.

A **consulta pública** (`/consulta`) mostra a grade publicada por turma, professor ou sala, sem login. No celular, a grade aparece em lista por dia. O botão **Copiar link** gera o endereço direto de uma turma, para enviar aos alunos.

## 11. Exportar

Em **Exportações** (ou **Exportar** na lista de versões):

- **PDF por turma, professor ou sala:** uma página por grade, pronta para o mural. Dá para gerar todas ou uma só.
- **Página da turma:** segue o modelo do campus: logo, "Campus Coelho Neto - período", turma e turno; em cada tempo, a disciplina em negrito no alto e o professor embaixo, sem cores. Nomes muito longos ficam com a fonte um pouco menor, para a grade caber em uma página. Turma de um turno sai em **paisagem**; de dois ou mais turnos (como as do integrado, com manhã e tarde), em **retrato**. Turma com turno "a definir" conta só os turnos em que tem aula.
- **PDF do campus:** capa com sumário e todas as grades num arquivo.
- **Planilha para o SUAP:** uma linha por aula, com professores e SIAPE, dia, turno, tempo, horário e sala.

PDF de horário não publicado sai marcado como _versão de trabalho_.

## 12. Contas de professores

Em **Usuários**, crie uma conta por professor, vinculada ao cadastro dele. Defina uma senha inicial e informe-a por um canal seguro.

O professor entra, marca a própria **disponibilidade** (no padrão do período, que os horários novos copiam) e vê **Minha grade** depois da publicação. Cada pessoa troca a própria senha pelo menu do nome, no canto superior.

Desativar uma conta encerra na hora as sessões abertas dela. Você não pode desativar a própria conta nem deixar de ser gestor.

## 13. Reimportação depois da grade pronta

Se uma reimportação ou uma correção em **Dados** mexe numa atribuição que já tem aulas na grade, essas aulas são marcadas **para revisar**, e nunca apagadas. No editor, a aba **Para revisar** lista essas aulas. Mova a aula para outro horário ou clique em **Revisada**.

## Problemas comuns

| Sintoma                                | Causa provável                                                    | O que fazer                                                                  |
| -------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Grade nunca fica válida, sempre com R7 | Laboratório menor que a turma                                     | Divida a turma em grupos paralelos ou ajuste a capacidade e o tipo das salas |
| Aulas sem lugar (R4)                   | Turma com mais aulas que tempos, ou professor indisponível demais | Veja o motivo na violação; confira **Dados** e **Disponibilidade**           |
| Muitas aulas geminadas separadas (F1)  | Poucos tempos seguidos no turno                                   | Reduza o tamanho do bloco ou aumente o peso da F1                            |
| A geração parou sozinha                | A API foi reiniciada                                              | Gere de novo; as versões já gravadas continuam lá                            |
| Professor não consegue entrar          | Conta desativada ou senha esquecida                               | Em **Usuários**, reative a conta ou defina uma nova senha                    |
