# QQ e Certificação

## Instalação no projeto correto

Projeto conferido na configuração local e na imagem: **supervisortechnet**, referência
**rwstmomeldwrjmczrmnp**, API `https://rwstmomeldwrjmczrmnp.supabase.co`.
O serviço do módulo verifica esse endereço antes de ler ou gravar.
A consulta remota pelo conector foi recusada; a migration foi validada em um PostgreSQL isolado.

1. A migration `20261013130908_add_quality_dashboard.sql` já foi aplicada pelo usuário.
   **Não execute novamente.** No SQL Editor do mesmo projeto, execute apenas a complementar
   `supabase/migrations/20261013140334_add_quality_technician_directory.sql`.
2. Publique a nova aplicação com `npm run build` pelo fluxo de deploy já usado no projeto.
3. Entre como gestor e abra **QQ e Certificação** no menu lateral.
4. Se precisar trazer o histórico, abra **Unidade de negócio → Importar histórico HTML** e selecione o HTML unificado fornecido. Isso traz as
   bases incorporadas, nomes, correções da origem e associações de supervisores.
5. Nas próximas atualizações, use **Importar planilha** na lateral do QQ para quebra (.xlsx),
   ou abra **Importação e filtros** no Técnico Certificado para enviar CSV/ZIP. As bases são independentes.

Gestores importam e editam o cadastro compartilhado de técnicos. Supervisores
consultam os três modos, aplicam filtros, exportam TC e usam a apresentação.
Controladores mantêm o acesso exclusivo às escalas.

## Integração nativa e cadastro de logins

### Restauração fiel do visual

O layout é novamente o do arquivo `DASH-QQ-TC-VRSJVNF3-120113102026.html`:
toolbar, filtros laterais, cards, tabelas, cores, gráficos SVG, detalhes e apresentação.
Não há iframe: os renderizadores revisados usam DOM nativo com estilos isolados em Shadow DOM
dentro do AppShell. A área ocupa a largura disponível e a apresentação remove a navegação externa.
O visual interno mantém as cores claras do HTML, sem redesenhar gráficos conforme o tema do AppShell.

`scripts/extract-quality-reference.mjs` gera os assets a partir da referência revisada;
SHA-256 `e2a41044c855276006e3d977a81bbd10ca220f96a720b7dfedf1f6888fde7dd2`.
Os dados pessoais, mapas de técnicos, bibliotecas incorporadas e a conferência histórica privada
não são incluídos no bundle. HTML enviado pelo usuário continua sendo interpretado apenas como dados,
nunca executado. **Conferência dos dados** consulta a cobertura das bases carregadas do projeto.
O botão legado de limpar a base fica oculto para preservar publicações e importações incrementais.

O cadastro nativo mantém os campos extras já solicitados (login, nome, cidade, setor e supervisor).
As importações, permissões e a base independente de Visita técnica permanecem no serviço existente.
Esta alteração visual **não exige nova migration** e não executa SQL nem grava dados de produção.

Validação: `node scripts/verify-quality-reference.mjs` compara estrutura, medidas, fontes, cores
e SVGs dos três modos com os frames originais usando registros sintéticos e rede bloqueada no comparador.
Também testa slides, filtros, cadastro e papéis. `verify-quality-incremental.mjs` e
`verify-technical-visit.mjs` verificam uploads sobrepostos sem tráfego para o banco real.

### Apresentação e slides do HTML de 13/10/2026

Em **Modo apresentação → Slides**, a sequência nativa percorre QQ por cidade e frente (30 s),
Visão Geral consolidada (90 s) e TC por cidade/supervisor (30 s), repetindo ao final.
Visita técnica usa somente slides de TC de sua própria base. Pausa/continua, anterior/seguinte,
contador e progresso estão disponíveis; setas e espaço funcionam também com foco no conteúdo.
A interação pausa o player e ocultar a aba pausa automaticamente. Encerrar restaura modo,
frente, filtros e visão diária/resultado. Os planos de projeção da sessão são preservados.

**QQ usa somente Adesão por padrão**, tanto no painel de frentes quanto na Visão Geral,
cards, gráficos, detalhamentos e slides. São as unidades DMV base (`NTL-DMV`, `FTZ-DMV_01`,
etc.). `_ADM`, `_VT`, MDU e outras unidades continuam no seletor, mas entram apenas por
seleção explícita. “Todas as unidades” inclui todas quando selecionada; “Voltar à Adesão”
restaura o padrão. Meses/datas e a seleção explícita de unidades são mantidos nos slides;
cidades/equipes alternam e os demais filtros retornam ao encerrar.

Nomes válidos do cadastro têm prioridade; login e placeholders não são tratados como nome.
TC tem linhas compactas, identidade em duas linhas e projeções/competências compactadas.
Nenhuma fórmula de indicador, importador, tabela ou política RLS foi alterada nesta atualização.
Não há nova migration a executar para estas funções. Publique a aplicação atualizada.

Regressão: `tests/quality-slides.test.ts`, `tests/quality-native.test.ts` e
`scripts/verify-quality-reference.mjs` verificam recorte, timers, filtros, nomes, visual original e
interações sem chamadas ao banco de produção (dados e tráfego Supabase simulados).

A rota `/qualidade` é uma página React dentro do AppShell: não há iframe nem página HTML
independente. Compartilha navegação, dados, cadastro e permissões, preservando o visual original
do HTML para os gráficos e tabelas. O modo apresentação exibe a própria página nativa em tela cheia.

Em **Logins e supervisores**, o gestor pode adicionar ou editar **login, nome, cidade, setor e
supervisor**, buscar cadastros e encontrar logins novos nas bases. Isso não cria usuários de login
no Auth, nem altera o cadastro do Quark. O cadastro passa a atualizar os dois painéis imediatamente.

**Importar cadastros** aceita os dois XLSX juntos ou separadamente. `loginsgeral.xlsx` usa
`login` e `tecnico`; `dados.xlsx` usa `Login`, `Colaborador`, `CIdade`, `Setor`, `Supervisor`.
Os valores de Login do arquivo de associações estão vazios. A associação é pelo nome completo
normalizado (acentos, caixa e espaços), nunca por aproximação. Duplicatas com associações idênticas
são aceitas; conflitos são avisados para revisão. Valores vazios não apagam o cadastro existente.

Uma prévia editável permite conferir os cinco campos. Linhas sem login ficam visíveis para
preenchimento manual e não são salvas enquanto estiverem sem login. O lote com login é salvo em
uma transação: uma linha inválida impede salvar todo o lote. Os arquivos fornecidos produzem
165 logins, 153 associados sem conflito, 12 sem correspondência de supervisor e 90 nomes ainda
sem login. O painel não inventa os dados ausentes.

A migration complementar aproveita cadastros que já estavam no banco; preserva a tabela antiga
e as bases/publicações existentes. Os XLSX não são incorporados ao código público nem enviados
automaticamente ao banco: a gravação ocorre após a revisão e confirmação na tela.

## Visita técnica

Nova entrada própria no menu lateral, rota `/visita-tecnica`, somente para Técnico Certificado.
Aceita **CSV ou ZIP com um CSV** no formato analítico de TC. Não importa QQ nem o HTML unificado.
Usa os mesmos cálculos, filtros, matriz diária, projeção, exportação, visual original e apresentação; o cadastro
de logins/supervisores é compartilhado. Gestores importam e editam o cadastro; supervisores consultam.
Controladores continuam restritos a Escalas.

No mesmo projeto **supervisortechnet / rwstmomeldwrjmczrmnp**, execute a nova migration
`20261013160016_add_technical_visit_certification.sql` e publique a build atualizada. Ela requer
`add_quality_dashboard`, que já foi aplicada. Não repita as migrations anteriores.

A base começa vazia e é independente do TC de **QQ e Certificação**: uma importação em Visita
técnica não altera a outra base. A nova tabela é `quality_technical_visit_data`, com o tipo
`technical_visit` em `quality_imports`. As importações incrementais e a proteção contra publicação
incompleta/concorrente continuam iguais, separadas por categoria. Nenhum dado antigo é copiado ou
apagado. A migration foi validada no banco local de testes; não foi executada em produção pelo agente.

## Estrutura do banco

| Tabela                         | Conteúdo                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality_imports`              | Tipo de base, arquivo, autor, contagens, metadados, versão anterior e publicação. Os dicionários de nomes ficam nos metadados protegidos por RLS. |
| `quality_quebra_data`          | Registros de QQ em blocos JSON de até 250 registros enviados pelo serviço; chave `(import_id, chunk_index)`.                                      |
| `quality_certification_data`   | Registros de certificação em blocos separados; mesma chave.                                                                                       |
| `quality_technical_visit_data` | TC exclusivo de Visita técnica, em blocos separados das outras bases.                                                                             |
| `quality_supervisor_registry`  | Legado preservado para compatibilidade/histórico.                                                                                                 |
| `quality_technician_directory` | Cadastro nativo por login: nome, cidade, setor, supervisor, autor e datas.                                                                        |

Cada bloco contém **registros individuais**, com todos os campos que o parser original
utiliza nos cálculos e no detalhamento de contratos. JSONB conserva nomes de campos,
valores e pesos fracionários do motor, sem um segundo cálculo SQL divergente.
As demais colunas do arquivo que o HTML original não utiliza não são acrescentadas
ao motor nem alteram os resultados. Os arquivos originais anexados permanecem intactos.

Uma importação começa pendente. A publicação confere quantidade de blocos, índices
contíguos e contagem de registros. Uma falha mantém a última versão publicada disponível.
Versões publicadas permanecem no histórico. Uma publicação concorrente de outro gestor
faz a importação desatualizada falhar com instrução para atualizar e reimportar.
Não há exclusão automática das versões históricas.

## Arquivos, campos e regras preservados

### QQ — XLSX analítico

O leitor original identifica a planilha pelos cabeçalhos. Exige
`TIPO_ATENDIMENTO`, `DAT_AGENDA`, `TIPO_TRATAMENTO`, `SUB_AGRUPAMENTO_SC`
e uma coluna `UN_TECNICO` ou `UNIDADE_NEGOCIO`.

| Origem                                                          | Campo do motor                                                                      | Uso                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `DAT_AGENDA`, `SEMANA`                                          | `d`, `w`                                                                            | Competência, dias e evolução semanal.                            |
| `LOGIN_TEC`, `UN_TECNICO`, `DSC_CLUSTER`, município             | `lt`, `un`, `cl`, `ci`                                                              | Técnico e filtros de operação.                                   |
| Tipo de atendimento / grupo da O.S.                             | `f`, `gf`                                                                           | ND, PME, Migração e ME; agrupamento ND/PME do painel por frente. |
| `TIPO_TRATAMENTO`, `SUB_AGRUPAMENTO_SC`                         | `b`, `c`, `rawCategory`                                                             | Quebra e pesos de qualificação.                                  |
| Contrato, O.S., workorder, baixa, responsável, serviço e janela | `contract`, `os`, `wo`, `baixa`, `responsible`, `service`, `time` e demais detalhes | Deduplicação e conferência por contrato.                         |

Quebra = quebras elegíveis / total de agendas. Qualificada = soma dos pesos das categorias
elegíveis / total de agendas. “Mais de um processo” conserva o rateio em três parcelas de
1/3. Permanecem as exceções da baixa 409, reagendamento pelo cliente e agendamento não
cumprido. “Outros” não entra no numerador qualificado.

As metas originais são mantidas: qualificada ND/PME/ME 7% e Migração 11,5%; quebra
ND/PME/ME 20% e Migração 30%. As referências mensais do HTML só são aplicadas pela
verificação de assinatura original do recorte; não são usadas genericamente em novas bases.

A atualização incremental é automática nos dois tipos de base. Mantém a chave composta da
origem, atualiza os mesmos atendimentos e inclui os novos sem apagar dias ou unidades ausentes
do arquivo. Não há substituição de meses inteiros: um recorte de 21/09 a 13/10 complementa uma
base de 22/08 a 05/10, e um recorte posterior até 20/10 prolonga a base sem repetir as O.S. anteriores.
Duplicatas dentro do arquivo ou da base anterior são consolidadas por essa chave, com a última
linha prevalecendo. O nome do arquivo não identifica um atendimento.

Antes de importar, o sistema consulta a última publicação, inclusive de outros gestores. Bases
inalteradas são reutilizadas em memória para evitar baixar os blocos de novo. Um arquivo que
não muda registros nem metadados de cálculo não grava outra versão completa; renomear um CSV
não o transforma em novos atendimentos. A tela informa adicionados, atualizados, sem alteração,
duplicatas consolidadas, total e período da base acumulada. Publicações alteradas mantêm o histórico
de versões já existente; somente a última versão entra no painel e nos cálculos.

### Técnico certificado — CSV ou ZIP de um CSV

O parser original usa separador `;`, campos entre aspas e fallback Windows-1252 quando
necessário. ZIP precisa conter exatamente um CSV. Campos obrigatórios:
`LOGIN_TECNICO`, `QT_REVISITA`, `TOTAL_OS_TEC1_PADRAO`, `QTD_TOTAL_OS_TEC1`,
`QTDE_PONTOS`, `FIM_TRABALHO`, `DATA_NOTA`, `NM_MUNICIPIO`, `SUBCLUSTER`,
`GRUPO_ORDEM_SERVICO`, `TIPO_JOB`, `UF`, `WORKORDER`.

| Origem                                           | Campo do motor                        | Uso                                                    |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| `DATA_NOTA`                                      | `month`, `year`, `noteAt`             | Competência mensal.                                    |
| `FIM_TRABALHO`                                   | `day`, `finish`                       | Dia de trabalho, filtro de datas e chave de unicidade. |
| Login e unidade                                  | `login`, `baseUnit`                   | Cadastro por login e regra de Fortaleza.               |
| Revisita / WO de retorno                         | `qr`, `revisitWo`                     | Numerador de revisita.                                 |
| Contadores TEC1                                  | `tnum`, `tden`                        | Numerador e denominador do TEC1.                       |
| Pontos                                           | `points`                              | Produtividade e detalhamento.                          |
| Contrato, O.S., baixas e demais campos opcionais | `contract`, `orders`, `lowCodes` etc. | Conferência individual.                                |

Unicidade = workorder + login + fim do trabalho normalizado. Reimportações atualizam
os mesmos atendimentos. Revisita conserva a contagem de retornos distintos por técnico
em FTZ-DMV_01; nas demais unidades usa WOs marcadas com revisita. TEC1 é a soma dos
contadores padrão dividida pela soma das O.S. avaliadas. Produtividade é a soma dos pontos
dividida pelos dias distintos com pontos. Certificação exige simultaneamente revisita
**< 7,01%**, TEC1 **≥ 95%** e produtividade **≥ 127 pontos/dia**.
O consolidado é certificados / técnicos avaliáveis, com meta de 75%.

Exceção exclusiva de **Visita técnica**: a produtividade mínima para certificação é
**≥ 175 pontos/dia**, inclusive no valor exato de 175. O TC de **QQ e Certificação** continua
com **≥ 127 pontos/dia**. Revisita < 7,01%, TEC1 ≥ 95%, fórmula de pontos por dias produtivos
e meta consolidada de 75% permanecem iguais. A regra é configurada por instância do painel;
status mensal/diário, cores, gráficos, projeções, slides e exportação usam a mesma meta da
instância, sem modificar ou reimportar os registros do banco. Não precisa de migration.
`scripts/verify-technical-visit-productivity.mjs` verifica os dois painéis, os limites 174,99/175,
projeções, exportação e slides com dados fictícios e sem chamadas externas reais.

O recorte de **Visita técnica** é obrigatório pelo cadastro compartilhado: entram apenas registros
cujo login tenha `sector = Visita técnica` no cadastro de logins. A comparação ignora acentos,
maiúsculas/minúsculas e espaços extras. Não se deduz o setor pelo nome, cidade, unidade `_VT`,
grupo do serviço ou conteúdo do CSV. Logins desconhecidos, sem setor ou de outros setores não
participam dos totais, gráficos, status, projeções, exportação ou slides dessa aba. A lista de
cadastros nessa aba mostra apenas VT; a importação de cadastros usa o cadastro completo para
associação por nome e detecção de duplicatas, mas sua prévia/salvamento em VT seleciona somente VT.
O cadastro de QQ e Certificação continua completo.

A importação analítica de Visita técnica aceita o mesmo CSV/ZIP completo usado no outro painel,
mas continua em sua base independente. Os registros originais de todos os setores são mantidos
no banco e no cache: o recorte ocorre somente na exibição, antes de hidratar os dados e calcular.
Alterar o setor de um login no cadastro inclui ou remove seu histórico de VT sem nova importação.
Se o cadastro não puder ser confirmado, VT não calcula usando o cadastro legado sem setor.
Sem logins classificados como Visita técnica, a tela explica como fazer a associação.

Filtros de unidade, cidade, setor, supervisor, competência e período são nativos, com recortes
adicionais de cluster/semana no QQ e UF/subcluster/grupo/job no TC. Há evolução mensal/semanal/diária,
composição por categoria/login, comparação por unidade/frente, matriz diária, detalhamento de O.S.
e exportação de TC. A projeção usa a última competência da base, ignorando somente o filtro de meses,
como no original. Seu planejamento é um cenário da sessão e não altera os registros nem a
certificação histórica publicada. As funções de cálculo são as extraídas do documento original.

## Preservação e validação

O motor `src/lib/quality-math.js` foi extraído mecanicamente das funções puras do HTML,
sem DOM, frames, cadastros embutidos ou execução dinâmica. O script de extração é
`scripts/extract-quality-math.mjs`. SHA-256 da referência estudada:
`eea2c0fe7e29d9b760698e053ff96bb05384905f193c7ef28354eece84fd8397`.
Os HTML e adaptadores da implementação embutida foram removidos da aplicação. Bases e nomes
são carregados do banco com autenticação e RLS. Importar o histórico HTML extrai somente JSON
e bases compactadas; não executa scripts do arquivo escolhido.

Com os arquivos reais anexados, a comparação com o motor original coincidiu para
22.429 registros válidos de QQ e 46.128 WOs de certificação, incluindo os indicadores
e status de 176 técnicos. O teste de integração usa respostas locais simuladas do
Supabase; não envia esses arquivos ao banco de produção.

`supabase/tests/quality_security.sql` verifica acesso por papel, importações incompletas,
mistura dos tipos de base, publicação concorrente e imutabilidade das versões publicadas.
Esse teste utiliza perfis fictícios e deve rodar somente no banco isolado de testes.

`supabase/tests/quality_directory_security.sql` valida cadastro, atualização/exclusão, lote
transacional, bloqueio de supervisores/controladores na escrita e ausência de acesso anônimo.
Os testes de navegador `scripts/verify-quality-panel.mjs` (parsers/cálculos contra o original) e
`scripts/verify-quality-reference.mjs` (paridade visual/cadastro/apresentação/perfis) são locais e
interceptam chamadas ao Supabase; não gravam dados em produção.

`supabase/tests/technical_visit_security.sql` e `scripts/verify-technical-visit.mjs` verificam a nova
aba, importação exclusiva de TC, isolamento entre as bases, atualização incremental e acesso por papel.

## Carregamento das bases (sem alteração de cálculos)

QQ, TC e o cadastro possuem consultas independentes. Ao abrir QQ, TC só é buscado ao abrir seu
painel, o cadastro de logins (para descobrir os pendentes nas duas bases) ou iniciar slides. Visita
técnica continua carregando somente sua base exclusiva de TC. Os slides aguardam todas as bases
necessárias, e os gráficos recebem apenas registros completos e validados.

Os blocos são lidos em páginas de oito blocos, com até quatro páginas simultâneas por base.
A ordem original, os índices contíguos e a quantidade de registros do manifesto continuam sendo
conferidos. Falhas não entregam uma base parcial aos motores. Requisições em andamento são
canceladas ao sair do módulo ou da conta. O cadastro compartilhado continua atualizado por login.

Bases validadas podem ser reutilizadas em RAM por 30 minutos. Há também um cache opcional
compactado, sem perda de dados, em IndexedDB (`technet-quality-cache-v1`), separado por projeto,
usuário e tipo de base. Guarda somente a última versão de cada tipo por usuário, com validade
máxima de sete dias. Nenhum token ou credencial é armazenado nesse cache. Antes de reutilizá-lo,
sempre é consultado o manifesto atual pelo Supabase autenticado; ele não serve como acesso
offline nem como alternativa a uma negativa de permissão. Versão diferente, cache inválido ou
armazenamento indisponível levam a uma leitura normal do banco. Logout/troca de conta limpam
as cópias da conta anterior e impedem gravações pendentes. O botão Atualizar base consulta novamente
as versões, mas não baixa blocos inalterados.

Na importação, a conferência da versão publicada e a proteção contra publicação concorrente
permanecem obrigatórias. O caminho de importação não usa cache de disco para decidir a base a
complementar. Deduplicação, fórmulas, metas, parsers e funções dos renderizadores originais não
foram alterados para esta otimização. Não é necessária nova migration nem alteração no banco.

`tests/quality-loading.test.ts` verifica paralelismo, ordem, cancelamento e falhas.
`scripts/verify-quality-loading.mjs` testa carregamento independente, slides aguardando TC, cache
por versão, corrupção, rejeição de blocos incompletos, permissão, isolamento por conta e logout
em navegador real, com dados fictícios e todas as chamadas externas interceptadas.
`scripts/profile-quality-loading.mjs <caminho-do-HTML>` mede o tempo de QQ, abertura de TC e
reabertura com cache usando os dados do HTML, sem enviar nada ao banco. Esses tempos são locais
com latência simulada, não medições do site publicado nem do plano do banco.
