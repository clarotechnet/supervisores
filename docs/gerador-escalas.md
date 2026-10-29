# Gerador 5x2 — primeira etapa (branch de desenvolvimento)

## Situação em 27/10/2026
- Botão **Gerar prévia 5x2** foi incluído no módulo Escalas.
- O mês escolhido na página é sempre a competência de destino. O botão fica
  disponível mesmo quando essa competência ainda não existe no Supabase.
- A geração carrega automaticamente a escala do mês anterior do mesmo setor/cidade.
  Se ela não existir, explica o impedimento sem criar dados fictícios.
- O gerador é determinístico: respeita exclusões, quotas conhecidas, folgas,
  descanso nos sábados de plantões, turnos fixos e histórico básico de rodízio.
- O calendário é semanal por domingo–sábado, conforme a operação.
  O mês anterior fica imutável; o seguinte é provisório.
  Ex.: 29/11–05/12 e 27/12–02/01 aparecem na prévia.
- Nenhuma geração altera diretamente a escala original ou o Google Sheets.
- Rascunhos podem ser salvos em novas revisões na tabela schedule_generation_drafts.
 - Histórico pode ser consultado/reaberto pelo botão Gerar prévia 5x2.
 - Cada salvamento tenta gerar um evento generated em schedule_generation_events.
- A prévia pode exportar **relatório Excel**, ainda não a matriz completa editável.
- Testes automatizados em tests/schedule-generator.test.ts.

## Correção 28/10/2026 — primeira 5x2 em dezembro (Controle RN)

- **Novembro/2026 permanece 6x1**. Não deve fornecer nem exigir folgas fixas
  recorrentes para criar a primeira 5x2. O antigo aviso repetido de "folga fixa
  não identificada no mês anterior" era um falso bloqueio para essa transição.
- Para **Natal / Controle Operacional / Dezembro 2026**, o botão Gerar prévia
  agora abre **Carregar modelo inicial 5x2**, carregando exatamente a aba
  12-2026 do Excel `Escala_INTERNO_Dezembro_2026.xlsx`, enviado pela gestão.
- O modelo corrigido foi incorporado ao código com 42 colaboradores e 35 dias
  explícitos (01/12/2026–04/01/2027), sem alterar a planilha original.
  Arquivo-fonte convertido em src/lib/schedule-control-december-reference.ts.
- A referência contém 5 eventos em dezembro, com 3 plantonistas cada. Inclui
  também janeiro 01, 02, 03 e 04 como continuidade real da referência.
- Novembro só fornece correspondência de login e histórico de 30/11, sem
  substituir os códigos de dezembro pela escala 6x1.
- **A referência original ainda precisa de confirmação**: há semanas inteiras
  com menos de duas folgas para alguns colaboradores, incluindo coordenadores e
  plantonistas. O sistema mantém essas marcações e alerta, sem inventar folgas.
- A partir de janeiro/2027, o gerador volta a usar dezembro (de preferência a
  planilha operacional sincronizada) como histórico, preservando 01–04/01.
- Não altera escala oficial, rascunhos anteriores nem planilhas existentes;
  salva uma nova versão somente após ação do gestor.
- O código continua sem commit, push ou deploy até autorização explícita.

### Editor do modelo inicial (implementado localmente, sem deploy)

- O Excel de dezembro/2026 é **referência inicial**, não aprovação automática.
- Dentro de **Carregar modelo inicial 5x2**, clique em qualquer célula de
  dezembro/2026 ou da continuidade de janeiro/2027 (incluindo 04/01) para
  mudar livremente o código: T. 1, PLANTÃO, Folga, AT, férias, FALTA, outros.
- Clicar no nome abre a edição de nome, login e função. Também é possível
  incluir ou retirar colaboradores **apenas do rascunho**.
- Novembro/2026 (6x1) fica bloqueado contra edição nessa janela.
- Cada alteração **recalcula** as pendências 5x2 e cobertura de plantão;
  nada é corrigido sem escolha humana. Troca de plantonista exige editar
  as duas pessoas e conferir funções mínimas.
- As versões já salvas e o Excel original ficam intactos; a alteração
  precisa ser salva como **nova versão** antes de gerar um Google Sheets
  separado. A função publicada schedule-operational lê o payload salvo.
- Ao recarregar o modelo, a interface pede confirmação para não perder
  alterações não salvas.
- O histórico da primeira semana 30/11–06/12 permanece explícito como
  transição 6x1/5x2 a validar com RH, sem inventar regras retroativas.

## Revisão da referência em 28/10/2026 — Excel (2)

- Arquivo recebido: `Escala_INTERNO_Dezembro_2026 (2).xlsx` (aba `12-2026`).
- São **42 colaboradores e 35 datas** (01/12 a 04/01, 1.470 códigos),
  reproduzidos integralmente em `schedule-control-december-reference.ts`.
- SHA-256 do catálogo de linhas `nome|função|codificação`:
  `5d45286a46ba67e1df665e039177c4e711e74e626a0fd8df6697fc290d71a368`.
- O arquivo marca **19 colaboradores em verde** nas colunas Nome/Função:
  eles não entram no rodízio **automático** de plantão. Nenhum deles tem
  PLANTÃO marcado no modelo. Essa permissão pode ser mudada por pessoa
  na prévia (`Editar colaborador > Participa do rodízio automático`).
  A alteração fica em `policy_snapshot.rule.excludedFromDuty` do novo draft.
- Foram preservadas **21 marcações PLANTÃO e 36 de Férias**, inclusive em
  janeiro. Férias/AT/faltas não são classificadas como folgas da semana:
  a situação exige revisão separada do RH, sem gerar falso bloqueio 5x2.
- Exemplo Renan Paiva: PLANTÃO 06/12, folgas 07/12 e 09/12.
  **Não existe compensação antecipada em 05/12** neste novo arquivo.
- Revisão anterior: quatro alertas semanais; no novo modelo corrigido
  não restam bloqueios semanais 5x2 durante semanas completas em atividade
  (afastamentos são sinalizados separadamente).
- A importação nova é usada apenas ao **carregar nova prévia**. Rascunhos
  já salvos e abas já existentes não são sobrescritos automaticamente.
- As alterações ainda não foram publicadas no frontend ou Edge Function.
  Nenhum commit/push/deploy nem alteração em planilha real foi executado.

## Convenção operacional domingo–sábado (28/10/2026)

- As semanas do gerador e da IA passaram a ser **domingo–sábado** (0–6).
- No Controle RN, a semana 06–12/12 de MARTA MARIA contém as folgas de
  domingo (06) e sexta (11); o plantão de domingo 13/12 pertence a outra semana.
- Os quatro alertas restantes no modelo corrigido permanecem para revisão.
  A primeira semana 29/11–05/12 atravessa novembro 6x1 e não gera bloqueio
  retroativo de 5x2. Dezembro/2026 continua sendo a base inicial editável.
- Na geração seguinte, o sistema conserva domingo e o outro dia recorrente de
  folga identificados no histórico 5x2. Em caso de plantão no domingo, busca
  compensação **na própria semana** (preferindo segunda quando disponível),
  sem utilizar o sábado anterior como compensação.
- Atestados, férias e afastamentos requerem validação do gestor, e não viram
  folgas automaticamente.
- **Remover rascunho** é arquivamento reversível (não elimina histórico).
  Exige a migration `20261028141000_schedule_draft_archive.sql`.
  Só rascunhos ainda não aprovados e sem planilha operacional vinculada
  podem ser arquivados. O número de revisão não é reutilizado.
- Testes de 5x2, passagem de mês, plantões e arquivamento executados localmente.
- Nenhuma migration executada, nenhuma Edge Function implantada e nenhum commit.

## Regras
src/lib/schedule-generator-rules.ts contém os requisitos recebidos:
- RN: Adesão/Serviço, VT, MDU, Construção, Desconexão, Mossoró.
- CE: Instalação, Manutenção (Fábio T. 1 / 3 por plantão), Desconexão (sábado M. 1).
- PE: Instalação (1 por plantão), Desconexão.
- Controle RN: referência fornecida no Excel 12-2026; 42 colaboradores,
  plantões de 3 pessoas por domingo/feriado, incluindo pelo menos
  1 supervisor COP e 1 controlador de Adesão, mantendo turno T. 1 e código PLANTÃO.
  Os 11 nomes excluídos continuam proibidos de plantão.
- Folgas fixas podem ser segunda–sábado. **A partir de janeiro/2027**, o
  gerador poderá inferir padrões a partir da escala 5x2 de dezembro já revisada;
  nunca inferir o primeiro mês 5x2 a partir de novembro 6x1.
- O modelo Excel de Controle possui 31 dias de dezembro + 01–04/01. As
  datas de janeiro possuem serial do ano anterior; o importador da planilha
  identifica janeiro de 2027 a partir da âncora 12-2026.
  As marcações herdadas de 01–04/01 não são sobrescritas ao gerar janeiro.
- Nas semanas completas 07–13, 14–20, 21–27/12 e 28/12–03/01, o modelo
  contém **14 ocorrências de semanas com menos de duas folgas**. São exceções
  reais a confirmar. A semana 30/11–06/12 atravessa a transição 6x1/5x2,
  por isso é destacada separadamente para revisão do RH.

Quantidades NÃO informadas continuam null e bloqueiam publicação:
- Fortaleza Instalação: quantidade de técnicos por plantão.
- Controle RN: cobertura total e mínimo por tipo de função foram inferidos
  do arquivo de dezembro; detalhes por cidade/localidade e horários efetivos
  continuam sujeitos à confirmação operacional.

## Fonte de dados e persistência
Já existe sincronização Google Sheets => schedule_uploads no Supabase.
A tabela schedule_uploads é atualmente um UPSERT por city/sector/month e
NÃO deve receber alterações manuais diretamente, pois nova sincronização poderá
sobrescrevê-las.

A migração local supabase/migrations/*_schedule_rules_and_drafts.sql cria
tabelas separadas para políticas, rascunhos e trilha de mudanças.
O usuário informou ter executado a migração em 27/10/2026. A API do projeto
Supervisores confirmou a existência das três tabelas (SELECT anônimo negado por
permissão). Falta testar INSERT/SELECT com usuário autenticado e RLS.

## Etapas ainda necessárias
1. Testar com usuário autenticado o salvamento e a leitura de rascunhos.
2. Permitir que administradores editem as políticas no banco (tabela já criada).
3. Adicionar editor de células e sistema de aprovação/publicação.
4. Complementar validação com histórico de férias e AT por intervalos e confirmar
   dias provisórios na competência seguinte; a visão semanal já foi implementada.
5. Adicionar horas/intervalos e regras legais/CCT parametrizadas pelo RH.
6. Conectar uma API externa de IA somente para interpretar comandos/regras,
   com secret no servidor. Não enviar nomes/IDs reais ao plano gratuito
   sem avaliação de privacidade.
7. Testar históricos reais de todas as áreas e comparar com escala oficial.
8. Avaliar exportação de matriz completa de horários para Excel e Sheets.

## Importante
A prévia NÃO significa conformidade trabalhista. Valida apenas parte das regras
operacionais. Se houver bloqueios, a publicação deverá ser recusada. A aprovação
humana e a validação de RH permanecem obrigatórias.


## Atualização 28/10/2026 — edição em todas as frentes e fonte oficial única

A limitação anterior do editor ao Controle foi removida. Prévia mensal editável para todas as frentes; dezembro RN usa os seis modelos enviados. Escalas já alimentadas pela API têm editor de códigos que grava na aba oficial. Novas escalas criam somente uma aba mensal no arquivo oficial, sem arquivos ATUALIZADA/PLANEJADA separados. Aprovação continua explícita. Detalhes, permissões, testes e ativação em `edicao-escalas-oficiais.md`.


## Ajuste 28/10/2026 — abertura semanal e continuidade de férias

A prévia sempre começa em **Por semana**, na primeira semana, ao abrir, gerar ou carregar um rascunho. Mês completo continua disponível para consulta.

Férias herdadas do último status da origem são mantidas nos dias sem programação explícita, inclusive no próximo mês provisório, sem presumir uma data de retorno. A confirmação dessas datas passa a ser apenas um aviso: a gestão poderá ajustar os códigos na própria aba mensal oficial. Marcações explícitas já existentes continuam preservadas. AT e os demais bloqueios continuam sujeitos às regras anteriores.

Ao reabrir um rascunho antigo, somente a pendência exata de confirmação das datas de férias é reclassificada quando há férias na competência. Nenhum registro salvo é atualizado automaticamente. A interface pede salvar uma nova versão para persistir a revisão; aprovação e publicação continuam exigindo ação do administrador. Esses ajustes não exigem SQL nem alteração de Edge Function.


## Regra atualizada — férias e semana de referência

Esta regra substitui a continuidade automática de férias descrita anteriormente: ao gerar uma nova competência, férias do mês anterior não são prolongadas para os dias ainda sem programação. Esses dias seguem turno normal, folgas fixas e rodízio. Datas explícitas do novo mês, inclusive férias, são preservadas. AT continua protegido até retorno explícito.

Uma única semana marcada com folga já fornece a referência para o dia fixo. O gerador usa as folgas existentes no mês-base e, quando já preenchidas na origem, as marcações dos primeiros sete dias da competência seguinte. Com férias no restante do histórico, a referência conhecida continua válida. Sem nenhuma referência de folga no Controle, a pendência de confirmação permanece. As quotas e a compensação de plantões na mesma semana continuam validadas.

A regra vale para novas gerações; abrir uma versão antiga preserva sua escala e histórico. Dezembro RN continua usando os modelos iniciais fornecidos, sem transformar o histórico 6x1 de novembro em padrão 5x2. O Assistente IA agora acompanha a prévia no próprio gerador; veja assistente-ia-escalas.md.


## Ajuste 28/10/2026 — distribuição de folgas de terça a sexta

Natal VT usa grupos fixos de 4 na terça, 4 na quarta, 4 na quinta e 5 na sexta. Natal Adesão/Serviço recebeu como meta 18/18/18/19. A referência contém 78 pessoas: quatro com AT durante dezembro e 74 com programação. Como a meta soma 73, a prévia indica a diferença como pendência de publicação até revisão da gestão. Não retirar uma pessoa nem liberar um plantão proibido para fechar a conta.

O rebalanceamento conserva os plantonistas de domingos e feriados, os AT, as férias e faltas explícitas e as compensações existentes. A restrição de plantão não exclui ninguém das folgas semanais. A interface mostra a contagem por dia, a meta, o total no rodízio e o total afastado. Edições manuais são revalidadas sem executar de novo o rebalanceamento.

Essas metas pertencem somente à Adesão/Serviço e à VT de Natal. MDU, Construção, Desconexão, Mossoró, Fortaleza e Recife conservam suas regras. O arquivo de referência RN é um modelo; novas abas mensais continuam no arquivo regional configurado em Atualizar via API. Nenhuma cópia operacional adicional é criada.
