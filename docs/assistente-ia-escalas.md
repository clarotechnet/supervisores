# Assistente IA de Escalas — projeto Supervisores

## Implementação local (sem deploy / commit)

Página Escalas > Assistente IA. Administrador ou supervisor ativo escolhe:
- Uma escala operacional criada no Google Sheets e já sincronizada.
- Um rascunho 5x2 salvo no Supabase.

O backend schedule-ai lê os dados diretamente no banco (não aceita matrizes enviadas
pelo navegador), valida sessão/role e executa a análise por regras antes da IA.

A função identifica:
- Falta/AT/afastamento em dia planejado de trabalho.
- Cobertura menor que a programada em domingo/feriado.
- Falta de supervisor COP / controlador Adesão quando exigidos pela regra.
- Semana inteira domingo a sábado com descanso menor que dois dias ou
  mais de cinco dias classificados como trabalho.

Correção de 28/10/2026: uma semana 6x1 não exige necessariamente
um substituto; exige identificar um **dia adicional de folga**.
O analisador agora retorna até cinco datas possíveis (dias de trabalho
que NÃO sejam PLANTÃO, domingo ou feriado), sujeitas à revisão da
cobertura. Essas opções são exibidas mesmo quando não existe um
substituto disponível. A Groq recebe somente as datas e pontuações,
sem nomes ou dados de saúde. Para o Controle RN em dezembro 2026,
a semana de 29/11 a 05/12 é transição do 6x1 e não entra nas
pendências do 5x2; as semanas seguintes entram normalmente.
A referência corrigida do Excel apresenta 4 ocorrências por semana
operacional domingo–sábado (antes 6 no cálculo segunda–domingo);
o registro antigo em Sheets e rascunhos antigos não são reescritos.

Sugestões de substituição são apenas indicações preliminares. O sistema NÃO sugere
AT/férias/falta como disponibilidade; se a pessoa tem duas folgas na semana, não
sugere ocupar uma delas (aumentaria trabalho e retiraria o descanso).
A estrutura atual não confirma qual folga é fixa individualmente; a gestão deve
revisar o calendário e CCT antes de qualquer remanejamento.

A IA não é motor de regra, NÃO pode alterar calendários, importar/exportar
planilhas nem gravar histórico. A aplicação aceita apenas candidatos
pré-enumerados pelo motor de regras. Todas as ações são leitura.

## IA externa opcional

Função local: supabase/functions/schedule-ai/index.ts
Configuração local: supabase/config.toml [functions.schedule-ai]

Usa o endpoint Chat Completions da **Groq** via HTTPS:
https://api.groq.com/openai/v1/chat/completions

Modelo padrão: openai/gpt-oss-20b, oferecido pela Groq (o prefixo
openai/ é parte do identificador do modelo e NÃO significa faturamento
pela API da OpenAI). Modelo opcional via GROQ_MODEL. Llama 3.1 8B e
Llama 3.3 70B foram descontinuados em 16/08/2026 para free/developer,
por isso não são o padrão.

Secret: GROQ_API_KEY, definido SOMENTE nos Secrets da Edge Function.
Não copie a chave para código, .env público, repositório ou chat.

A função usa resposta JSON Schema estrita e permite apenas IDs de
candidatos preexistentes no motor de regras. Envia à Groq apenas IDs
pseudônimos C1/C2, datas, contadores e indicadores, sem nomes/logins,
cargos, motivo do afastamento ou planilha original. Executa sob clique,
não em background. Sem GROQ_API_KEY/limite gratuito excedido/falha do
provedor, retorna a análise local pelas regras, sem fingir que houve IA.

O plano gratuito da Groq possui limites de requisições/tokens, sujeitos
a mudanças; confira os limites do painel da sua organização. Dependendo
da conta/plano e dos limites, o uso pode gerar cobrança somente se você
contratar um plano pago. Nenhum contrato é criado pelo código.

### Habilitar (NÃO executado nesta alteração)
1. Na conta Supabase do projeto rwstmomeldwrjmczrmnp, acessar:
   Edge Functions > Secrets e configurar GROQ_API_KEY com a chave Groq.
2. Opcionalmente configurar GROQ_MODEL=openai/gpt-oss-20b.
3. Para atualizar a função REMOTA que já existia, executar:
   npx supabase functions deploy schedule-ai --project-ref rwstmomeldwrjmczrmnp
4. Fazer uma análise com um usuário autorizado, conferir indicação
   "Análise com modelo de IA + regras" e nota "Groq (...)".
5. O frontend local exibe o botão; a versão publicada do site só é
   atualizada quando sua equipe publicar o frontend separadamente.

Documentação técnica Groq:
https://console.groq.com/docs/api-reference
https://console.groq.com/docs/structured-outputs
https://console.groq.com/docs/deprecations

Nenhuma nova migration SQL é necessária; usa as tabelas já criadas para
rascunhos e escalas operacionais.

## Limitações
Não aplica alterações automaticamente. Não mede horas reais trabalhadas,
intervalos interjornadas/intrajornadas, banco de horas nem interpreta CCT.
Candidatos não equivalem a aprovação jurídica.
A planilha operacional exige sincronização manual para aparecer atualizada.


## Integração na geração — 28/10/2026

O assistente passa a acompanhar a prévia aberta no gerador, antes mesmo de salvar. As regras são recalculadas a cada alteração. A análise externa é consultada após uma pausa de dois segundos quando existem conflitos; a opção Análise IA automática permite pausá-la. Cada edição cancela o uso da resposta anterior e impede que uma resposta atrasada apareça como revisão da prévia atual.

O painel apresenta folgas semanais, cobertura, funções obrigatórias e as pendências que impedem publicação. Aplicar Folga ou Escalar colaborador altera somente a prévia local, revalida os dados atuais e exige Salvar nova versão para persistir. Sugestões antigas são recusadas; datas históricas, férias e AT já marcados não são usados como substituição automática. O turno individual configurado é respeitado. A lista de substitutos de uma função obrigatória contém apenas pessoas daquela função.

A consulta de versões já salvas permanece disponível dentro do gerador em Analisar escala salva. O botão separado do painel principal foi removido. Por semana continua sendo a abertura padrão.

A função schedule-ai recebe agora um alvo exclusivo preview, com competência, escopo, calendário e regras limitados e validados. Exige sessão e perfil ativo, mantém Controle restrito ao administrador e não executa mutações ou RPCs de escrita. A Groq continua recebendo apenas indicadores e identificadores pseudonimizados; nomes, logins, cargos e códigos de saúde não são enviados ao modelo.

Ativação: atualizar o frontend e implantar a versão local de schedule-ai, que inclui o novo helper schedule-ai-preview.ts. Nenhum SQL adicional é necessário para esta integração. Sem esse deploy, a análise local continua funcionando, mas a função antiga não aceita o novo alvo de prévia. Nenhum deploy foi executado automaticamente. Testes da Edge usam respostas simuladas, sem consumo de API externa.
