# Geração assistida pelo histórico oficial

A partir de janeiro/2027, cada cidade e frente usa exclusivamente a competência anterior sincronizada no sistema. Natal e Mossoró usam suas fontes oficiais configuradas em Atualizar via API; o workbook de referência RN continua sendo apenas o modelo inicial de dezembro. Outras cidades podem partir de dezembro montado manualmente e importado por essa mesma API. Janeiro alimenta fevereiro, e assim sucessivamente.

## Fluxo

1. Ajustar a aba oficial e executar Atualizar via API.
2. Selecionar cidade, frente e mês de destino no gerador.
3. Clicar em Gerar escala com IA. A fonte é consultada novamente nesse momento.
4. Revisar a prévia, corrigir pendências e salvar uma nova versão.
5. Criar/vincular a aba mensal pelo fluxo existente e usar Aprovar e publicar por ação explícita do administrador.

Gerar a prévia não salva, aprova, publica, cria arquivo ou altera o Google Sheets. As ações de salvamento e publicação continuam separadas. O histórico anterior permanece disponível.

## Memória operacional

Uma semana normal completa, de domingo a sábado, identifica a folga fixa individual. A semana normal mais recente prevalece quando a gestão alterou o dia. Férias, AT, faltas, feriados, compensações e BH não são usados para identificar esse padrão. Uma continuidade futura explicitamente marcada pode ser aproveitada quando contém trabalho normal e uma única folga semanal identificável.

Sem evidência suficiente, o gerador sinaliza pendência antes da aprovação; corrigir/completar a base oficial e sincronizar novamente. Férias do mês anterior não se prorrogam automaticamente; datas explicitamente marcadas no destino são mantidas. AT continua protegido e exige conferência. A folga fixa não é redistribuída para atingir porcentagens e não é automaticamente trocada por plantão em feriado. Quando faltam pessoas elegíveis, aparece pendência de cobertura.

Impedimentos de plantão e turnos individuais registrados na versão aprovada são carregados para o mês seguinte. A ausência de plantões em um mês não significa impedimento permanente. As coberturas cadastradas por cidade/frente prevalecem. Uma cobertura ainda não configurada só é aprendida quando os eventos completos da base 5x2 apresentam o mesmo quantitativo; eventos contraditórios ou ausentes não geram estimativas. Uma cobertura aprendida e aprovada é conservada nas competências seguintes.

O calendário continua usando feriados nacionais fixos e datas adicionais já configuradas por cidade. Esta mudança não acrescenta uma consulta automática de feriados municipais ou móveis.

## Participação da IA

O motor cria até três propostas distintas com folgas e restrições verificadas. A Edge Function schedule-ai recebe contagens e identificadores anônimos de plantonistas. Nomes, logins, cargos e códigos de saúde não são enviados ao modelo nessa escolha.

A IA escolhe uma proposta completa considerando rodízio e concentração de plantões; não pode inventar outra escala nem selecionar proposta com mais pendências que as melhores opções disponíveis. As pendências restantes continuam visíveis e impedem a publicação pelo fluxo existente. Se houver somente uma proposta, chave ausente, erro ou indisponibilidade, o sistema mantém a melhor proposta pelas regras e informa o modo usado.

Ao salvar, policy_snapshot e o evento de geração registram a fonte, data de atualização, evidência da folga e escolha utilizada. Trata-se de memória operacional e geração assistida; não há treinamento de pesos do modelo. Rascunhos antigos continuam compatíveis.

## Ativação

Não exige SQL novo. Atualizar o frontend e publicar apenas a função modificada nesta etapa:

```powershell
cd D:\sistemas\supervisores
npx supabase functions deploy schedule-ai --project-ref rwstmomeldwrjmczrmnp
```

A seleção por IA utiliza os Secrets GROQ_API_KEY e GROQ_MODEL da função (modelo padrão: openai/gpt-oss-20b). A presença da chave em produção deve ser conferida no ambiente publicado. Sem chave, a geração pelas regras permanece disponível. Não é necessário publicar schedule-operational ou schedule-edit por causa desta integração; alterações anteriores nessas funções têm seu próprio procedimento de ativação.

Nenhum commit, push, merge, deploy ou aprovação de escala faz parte da validação local.

## Validação local em 29/10/2026

Passaram 373 testes Vitest em 54 arquivos, 68 testes Deno das Edge Functions, TypeScript, Deno check da função schedule-ai, ESLint dos arquivos alterados, git diff --check e build de produção. O build emite o aviso de bundles grandes nas dependências de exportação já existentes.

A interface foi exercitada com dados fictícios e serviços simulados: indicação de processamento e bloqueio do botão, nova leitura da fonte ao gerar, escolha aplicada à prévia, abertura por semana, cancelamento ao fechar e troca de cidade sem receber resultados atrasados. Os contadores da simulação permaneceram com zero gravações externas. Não foi executada chamada real ao modelo nem publicação de escala em produção nesta validação.

## Reanálise manual da prévia

O botão Reanalisar consulta a prévia imediatamente, inclusive sem alertas básicos ou com a análise automática desligada. Clicar novamente cancela a consulta anterior e inicia outra, sem aplicar sugestões. A espera automática de 2 segundos permanece apenas para edições da prévia. Fechar o painel, alterar a prévia ou desligar a análise automática cancela consultas anteriores; respostas atrasadas são ignoradas.

Uma consulta tem limite de espera de 25 segundos no frontend. Ao atingir esse limite ou falhar, o painel informa o ocorrido e mantém disponível a tentativa manual. Esta correção altera somente o frontend; não exige novo SQL nem novo deploy da função schedule-ai. Validaram-se 27 testes relacionados, TypeScript, ESLint, build e git diff --check, além dos fluxos da interface com serviço simulado.

## Semana que começa antes do dia 1

A memória considera a primeira semana domingo–sábado da aba, mesmo quando o domingo pertence ao mês anterior. A semana só é usada se todos os sete dias estiverem efetivamente preenchidos com trabalho normal ou folga, sem afastamento, falta, compensação ou feriado; as mesmas verificações das demais semanas continuam válidas. Nenhuma marcação ausente é inventada, e uma semana normal mais recente continua tendo prioridade.

Isso permite reconhecer, na semana de 29/11 a 05/12/2026 já presente na aba de dezembro, a sexta-feira de MARTA MARIA e o sábado de CLAYVERTON SOUTO. A validação local com o payload atual dos 42 colaboradores reconheceu todas as folgas fixas e preservou todas as sextas/sábados das duas pessoas na prévia de janeiro. A base não foi modificada.

As coberturas de 01/01/2027 (0/3) e 03/01/2027 (1/3) são pendências separadas: os dias já vieram preenchidos na extensão da base e continuam preservados. Reconhecer uma folga fixa não autoriza sobrescrever esses plantões. O ajuste deve ser revisado na prévia; a aprovação/publicação permanece explícita.

Validação: 60 testes relacionados, TypeScript, ESLint dos arquivos alterados, build e git diff --check aprovados. Inclui semana inicial completa, datas anteriores ausentes, exceções na semana e prioridade de evidência mais recente. Nenhuma escrita no Google ou no banco, aprovação, deploy ou commit foi executado.

Ativação: atualizar/recarregar o frontend e gerar uma nova prévia. Prévia/versionamento já salvo permanece como estava. Esta correção não exige SQL nem novo deploy de Edge Function.

## Sugestões para completar plantões na prévia

A análise passa a diferenciar o domingo habitual de folga da folga fixa de segunda a sábado. As evidências de folga fixa seguem na entrada limitada da análise, e a função mínima Supervisor COP considera esse cargo, sem confundir supervisor de campo. Pendências por função são exibidas mesmo quando a cobertura total é zero.

Quando há somente dois descansos, a prévia pode oferecer plantão junto com uma Folga compensatória na mesma semana e competência, para regras sem intervalo obrigatório entre plantões. A sugestão não utiliza folga fixa, BH, folga solicitada/compensatória, férias, atestado, ausência ou data desconhecida; não retira outro plantão. A compensação precisa de outro profissional trabalhando na função correspondente quando ela é supervisor COP ou Adesão. A contagem resultante mantém pelo menos dois descansos, no máximo cinco dias trabalhados na semana e nenhuma sequência acima de seis nos dados disponíveis. Continua sendo uma proposta operacional para revisão humana, sem conclusão legal/CCT.

O botão mostra nome, função, data de plantão, compensação e motivo. Aplicar usa a prévia atual e confere novamente o candidato e a compensação; as duas marcações entram juntas no rascunho em memória. Sugestão desatualizada, compensação ausente ou tentativa de alterar histórico/outra competência é recusada. Quando não há opção, a análise informa os impedimentos encontrados. As pendências de cobertura são recalculadas, retirando também o texto antigo de cobertura insuficiente depois do ajuste.

A IA recebe apenas identificadores anônimos, indicadores e necessidade/data de compensação. Nomes, logins, cargos e detalhes de saúde não são enviados ao provedor. O fluxo não salva, sincroniza, aprova ou publica automaticamente.

Simulação com a base oficial atualizada em 30/10/2026: para 03/01/2027, ALEX CAMPOS com Folga em 05/01 e ANA KAROLINE com Folga em 04/01 completaram 1/3 para 3/3 sem pendência restante daquela data. Também foram encontradas alternativas para 01/01; MARTA não é sugerida nesse dia, preservando a sexta fixa. Essa simulação foi local e não gravou na escala oficial, no Sheets ou no banco.

Validação: 23 testes focados passaram; na suíte completa, 454 de 455 passaram, com timeout no teste de PDF Quark (também reproduzido isoladamente, sem alterar esse módulo). Os 79 testes Deno, TypeScript, Deno check de schedule-ai, ESLint dos arquivos alterados, build e git diff --check passaram. A validação visual não foi concluída porque o navegador conectado retornou Debugger unattached. Os testes cobrem aplicação completa das duas marcações, atualização de bloqueios, proteção da folga fixa, indisponibilidade, histórico, cargos e privacidade.

Ativação: atualizar/recarregar o frontend e implantar schedule-ai atualizada. Não há SQL novo nem necessidade de implantar schedule-operational/schedule-edit por esta mudança. Nenhum deploy, commit, aprovação ou publicação foi executado.


### Publicar uma revisão corrigida usando a aba mensal existente

Salvar nova versão no Supabase mantém a versão anterior intacta. A aba mensal pode
continuar vinculada à revisão anterior, inclusive se aquele rascunho for arquivado.
O botão **Aprovar e publicar** aparece no histórico e no rodapé da versão selecionada.
Quando já existe uma única aba mensal ativa da mesma cidade, frente e competência,
a aprovação explícita usa essa aba e vincula a revisão escolhida na mesma transação
da publicação. Não duplica nem reescreve abas do Google.

Aplique manualmente 20261030153159_schedule_publish_saved_revision.sql e publique
schedule-operational para ativar o fluxo. A migration não aprova escalas.
A validação lê o Sheets atual antes de publicar; pendências de cobertura ou de
semanas 5x2 impedem a operação mesmo que a prévia salva esteja sem pendências.
Alterações feitas somente na prévia não são enviadas automaticamente a uma aba já existente:
os ajustes finais precisam estar no Sheets oficial. A mensagem identifica conflitos encontrados.

A RPC mantém o ID operacional e a auditoria de células, preserva a revisão anterior,
registra seu vínculo e payload anterior nos eventos e aprova somente a revisão escolhida.
Uma falha desfaz vínculo, eventos e publicação. Abas excluídas/em exclusão e versões
já aprovadas não são transferidas. **Atualizar via API** continua sincronizando a aba
vinculada com a escala publicada, incluindo faltas, AT, férias, plantões e folgas.


### Solicitar consulta ao Controle operacional

Em **Escalas → Acesso ao Controle**, supervisores e controladores podem consultar
sua situação e enviar **Solicitar acesso**, com motivo opcional. O atalho fica no
cabeçalho mesmo quando a frente selecionada é outra. O Controle RN multicidade
está cadastrado no escopo Natal; entrar por Mossoró, Fortaleza ou Recife leva
o pedido a esse escopo, sem alterar filtros da escala que estava aberta.

Um pedido pendente aguarda decisão; pedidos negados ou revogados podem ser
reenviados. A situação é atualizada enquanto o popup está aberto. Usuários já
autorizados recebem **Ver escala do Controle**. O administrador encontra
**Autorizações Controle** diretamente no cabeçalho e pode aprovar, negar ou revogar.

O fluxo requer a função schedule-access publicada. As tabelas e RPCs de
20261028170001_control_schedule_access.sql já estão instaladas no projeto,
conforme consulta de 30/10/2026. Nenhuma nova migration é necessária para o atalho.
A solicitação continua vinculada à sessão autenticada no servidor, e a autorização
é somente de consulta: não concede edição, geração, publicação nem link do Sheets.
