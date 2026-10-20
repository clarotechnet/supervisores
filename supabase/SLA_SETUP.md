# SLA Garantia no QQ e Certificação

## Projeto e instalação

O destino é exclusivamente **supervisortechnet**, referência `rwstmomeldwrjmczrmnp`.
O serviço recusa outro endereço de projeto. Não execute o SQL em outro banco.

1. Com o módulo de qualidade já instalado, execute o arquivo completo
   `migrations/20261020154717_add_sla_warranty_dashboard.sql` no SQL Editor desse projeto.
2. Publique o frontend atualizado.
3. Entre como gestor, abra **QQ e Certificação → SLA Garantia** e importe a base.

A migration cria apenas `sla_warranty_imports`, `sla_warranty_data` e suas políticas,
gatilhos e função de publicação. Não muda as tabelas ou os registros de QQ, TC,
Visita técnica ou Quark. Não instala secrets nem precisa de Edge Functions.
Ela pressupõe as funções privadas de permissão já existentes no módulo de qualidade.
Supervisores podem consultar; somente gestores ativos podem importar/publicar.
Controladores e usuários anônimos não têm acesso a essa base.

## Alimentação

- **Importar CSV / Excel**: aceita CSV UTF-8 ou Windows-1252 e XLSX (primeira aba).
  Para XLS antigo, salve antes como XLSX ou CSV.
- **Importar histórico HTML**: lê somente o JSON de dados incorporado no HTML de SLA;
  nunca executa scripts do arquivo. Traz a fonte atual e as fontes históricas presentes.
- Os arquivos CSV/XLSX substituem a fonte atual, como no HTML original. As fontes
  históricas já importadas permanecem separadas. Isso não é a mesclagem incremental do TC.
- Repetir o mesmo arquivo e conteúdo não acrescenta registros nem publica outra versão.
- Cada publicação só fica visível quando todos os blocos foram gravados e conferidos.
  Falhas mantêm a última base publicada. Importações concorrentes exigem atualizar e tentar novamente.

As colunas, a normalização, o agrupamento de atendimentos, as janelas de 10/30 dias,
os logs, as revisitas e a ponderação por tarefas seguem o HTML fornecido. A fórmula
por atendimento é `com padrão / (atendimentos + logs) × 100`. O modo de tarefas
mantém a ponderação original. As três fontes não são misturadas automaticamente.
Não há dados pessoais de exemplo incorporados no frontend publicado.

## Modo apresentação

O bloco de administração da base e os avisos informativos de importação ficam
ocultos na apresentação. Erros reais continuam visíveis para não apresentar uma
base incompleta como válida. Os filtros aparecem em uma barra compacta acima dos
indicadores: garantia, unidade de cálculo, local, UF, mês, tipo de OS, segmento,
unidade, fonte e datas. São os mesmos controles do modo normal, reorganizados sem
duplicar filtros ou alterar cálculos. Ao sair, o layout normal e suas ações voltam,
mantendo as seleções. Essa mudança visual não precisa de migration adicional.

## Técnico Certificado

O ajuste de importação do TC não precisa de SQL adicional. Leitura, validação,
mesclagem e comparação do CSV passam a ocorrer em um Web Worker. O painel informa
as etapas e o progresso do envio; falhas ficam visíveis sem substituir a base válida.
A atualização busca somente a base do painel de destino, sem esperar o download do QQ.
As regras de chave única, atualização incremental e cálculos permanecem inalteradas.
TC de QQ e TC de Visita técnica continuam com bases e importações independentes.

## Verificação local

Com `npm run dev -- --host 127.0.0.1 --port 5175`, os scripts `verify-sla-app.mjs`
e `verify-tc-worker.mjs` usam dados sintéticos e interceptam conexões externas.
`verify-sla-reference.mjs` compara o HTML local com o motor integrado, inclusive
os SVGs e os detalhes dos indicadores. `verify-sla-migration.mjs` executa o SQL
em uma instância efêmera de PGlite, sem acessar o banco de produção.

Esses testes não substituem a confirmação de execução da migration e do último
envio no Supabase de produção. Nenhuma aplicação remota da migration é implícita.
