# Layout da aba Escalas

Atualização local em 28/10/2026, baseada na estrutura de Painel_Escala_Equipe_Completa_31out (1).html e nas imagens enviadas. Mantém os tokens de cor, temas claro/escuro e os códigos de escala do Supervisores. Não incorpora scripts, arquivo de dados, regras de plantões individuais nem armazenamento local do HTML de referência.

## Consulta

- Mapa como visualização inicial; equipe inteira selecionada ao abrir uma nova escala.
- Filtros compactos de cidade, frente, mês, busca, função, área e base. Função/área/base são lidas da identificação já existente, sem excluir outros cargos ou inferir novos cadastros.
- Seleção manual de colaboradores em janela própria. Busca e filtros não apagam a seleção; sincronização do mesmo registro conserva os nomes ainda existentes e uma seleção vazia explícita.
- Visões Mapa, Calendário e Pessoas; modos compacto/detalhado e tela cheia.
- Rolagem da tabela dentro do painel, com nomes e cabeçalhos fixos. Em telas pequenas ou equipes grandes, mantém tamanho mínimo legível e permite rolagem interna.
- Clique no nome ou código abre resumo individual em pop-up, calendário mensal, dia anterior quando já presente no payload, plantões explicitamente marcados, PDF e os indicadores anteriores.
- Clique no cabeçalho abre a equipe do dia, agrupada por situação. A visão Calendário também mostra o detalhe lateral/abaixo.
- Observações da gestão continuam no fluxo existente. Edição de observações exige administrador.
- PDF completo no topo; PDF da seleção no rodapé; imagem/ZIP e CSV no menu Exportar. CSV usa apenas a seleção e neutraliza texto que poderia ser interpretado como fórmula.

O filtro antigo de trabalho/turno recebeu o rótulo Atividade no dia/mês para conservar sua regra existente sem confundi-la com plantão explícito. Indicadores de Plantões marcados contam apenas P/PLANTÃO. Não classificam fins de semana como plantão automaticamente.

## Gestão preservada

Atualizar via API, Assistente IA e Gerar prévia 5x2 permanecem em destaque. Editar escala oficial, escala editável/histórico, relatório Excel, importação, sugestões e Autorizações Controle ficam em Ações, conforme as mesmas permissões. Geração automática, edição das prévias, publicação explícita e vínculo com os Sheets oficiais não foram alterados.

O link editável do Sheets permanece condicionado a administrador no componente original. A restrição de consulta de Controle operacional e suas autorizações continuam no frontend/backend já implementados. As demais áreas conservam suas permissões.

Os estilos usam classes próprias da aba Escalas. AppShell, outras páginas, Edge Functions e migrations não foram alterados por esta mudança de layout. O componente base Dialog ganhou apenas uma propriedade opcional para o fundo desfocado; seu comportamento padrão permanece igual.

## Validação

- 316 testes Vitest aprovados, incluindo busca/filtros, identificação de funções/bases, totais mensais sem somar o histórico, plantões explícitos, CSV e regressões de geração/publicação.
- TypeScript e ESLint dos arquivos alterados aprovados.
- Build de produção executado.
- Conferência no navegador com 42 colaboradores fictícios: mapa, cores claras/escuras, filtro por base, busca, calendário, cartões, detalhes de pessoa/dia, largura pequena e rolagem interna. A área autenticada com dados reais não foi manipulada.
- Os arquivos temporários usados na conferência visual foram removidos do projeto.

Nenhuma escala/planilha real foi alterada, aprovada ou publicada nesta revisão. Nenhum SQL, commit, push, merge ou deploy foi executado. Para disponibilizar apenas esta mudança visual, ainda é necessário publicar o frontend com autorização; os requisitos de ativação das funções/migrations das etapas anteriores permanecem em seus documentos.
