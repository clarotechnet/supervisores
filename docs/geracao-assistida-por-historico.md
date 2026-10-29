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
