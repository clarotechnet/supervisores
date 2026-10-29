# Edição de escalas e prévias 5x2

Implementação local em 28/10/2026. Nenhuma implantação ou gravação em Sheets real foi realizada nesta revisão.

## Fonte oficial

Os arquivos Google Sheets já configurados por estado/frente continuam sendo a única fonte operacional. O Supabase guarda o conteúdo sincronizado para consulta, revisões do planejamento e auditoria. Não criaremos arquivos separados com abas ATUALIZADA/PLANEJADA para novas escalas.

Uma competência nova usa uma aba mensal no arquivo oficial. Se já existir uma aba da mesma frente/competência, a criação é recusada: o gestor deve editar a aba existente. Nenhuma aba histórica é limpa, substituída ou excluída pela criação.

Dezembro RN usa os modelos fornecidos em TechNET RN — Dezembro 2026 Adesão-Serviço — Escala 5x2 (CÓPIA): Adesão/Serviço (78), MDU (3), VT (17), Mossoró (8), Construção (27) e Desconexão (7). A referência incorporada serve somente para iniciar prévias ainda não aprovadas. Uma escala oficial nunca é reabastecida por esse arquivo estático.

## Prévia nova

1. Em Escalas, selecionar cidade, frente e mês de destino.
2. Abrir Gerar prévia 5x2; em dezembro RN, Carregar modelo inicial 5x2.
3. Conferir Mês completo ou Por semana (domingo–sábado).
4. Clicar em códigos ou nomes para editar. Inclusão/remoção e nome/login/função são ajustes do rascunho.
5. Salvar nova versão no Supabase. A versão anterior permanece no histórico.
6. Criar a aba do mês no Sheets oficial, apenas se a competência ainda não existir.
7. Aprovar e publicar exige ação explícita do administrador.

O editor atende todas as frentes com regras cadastradas, não depende de ser a referência inicial do Controle. Recalcula cobertura, descanso, afastamentos, rodízio e turnos configurados. Pendências de dados/regras ainda não confirmados continuam visíveis. Dias anteriores ao mês não são editáveis nessa prévia.

## Escala já sincronizada pela API

O botão Editar escala oficial abre a grade atual. Clicar em uma célula e em Salvar no Sheets oficial grava somente aquele código na aba original, registra a auditoria e atualiza o mesmo registro do painel.

Versões aprovadas abertas pelo histórico levam ao editor da escala oficial atual, em vez de editar o retrato antigo de aprovação. Atualizar via API continua recebendo faltas, AT, férias, plantões, folgas e demais códigos do Sheets.

Nomes, logins, funções, fórmulas e estrutura das abas existentes não são reescritos pelo editor oficial de códigos. Esses campos continuam no cadastro/Sheets original. O editor da prévia permite ajustá-los antes da primeira publicação.

Uma revisão não aprovada não vira fonte da API por ser a mais recente. Arquivos separados antigos permanecem apenas como histórico; não são recriados nem substituem o Sheets oficial.

## Permissões e auditoria

Controle operacional permanece administrável somente por administrador ativo; consulta de outros usuários depende da autorização implementada separadamente. Nas outras frentes, administradores e supervisores ativos mantêm a gestão. Controladores consultam. O link editável do Sheets continua restrito a administrador no frontend.

A função schedule-edit valida JWT, perfil ativo e escopo, resolve arquivo/aba no servidor e identifica pessoa/data novamente no Google. O navegador não escolhe coordenadas ou spreadsheet_id. Mudanças detectadas desde a leitura e células com fórmula são recusadas. Escrita RAW impede que um código seja interpretado como fórmula.

schedule_sheet_edits registra autor, célula, pessoa/data, código anterior/novo, estado e erro antes de gravar no Google. Estados: pending, sheet_written, applied, failed, unconfirmed. Falha ao iniciar a auditoria impede a gravação. Falha após gravar informa o resultado parcial; Atualizar via API recupera o conteúdo do painel a partir do Sheets.

Não há transação distribuída nem compare-and-swap atômico entre Google Sheets e Postgres. Há conferência antes/depois, registro da intenção e aviso de resultado parcial. Alterações simultâneas diretamente no Google ainda podem ocorrer no intervalo entre conferência e escrita. Uma execução interrompida antes de finalizar pode exigir conciliação da auditoria pending.

## Ativação pendente

Aplicar em ordem, somente com autorização:
- migrations anteriores, incluindo 20261028170001_control_schedule_access.sql se ainda pendente;
- 20261028170002_schedule_official_edit.sql;
- funções schedule-operational, schedule-sync e nova schedule-edit;
- funções schedule-access e schedule-ai da etapa de permissões, se ainda pendentes;
- frontend.

Manter os secrets existentes apontando para os arquivos oficiais RN principal, RN Controle, CE e PE. A criação/publicação geral é recusada sem a fonte oficial configurada. Publicação do Controle ainda exige o arquivo original validado.

A implantação das guardas de permissão deve preceder a ativação das restrições da migration de acesso; a interface nova deve ser publicada após o backend compatível.

## Validação local

- 309 testes Vitest, incluindo os seis modelos RN, editor de todas as frentes, células por pessoa/data, cobertura, rodízio e turno de sábado.
- 39 testes Deno de endpoints e permissões, sem acesso à rede: Google é substituído por fixtures. Cobrem gravação de uma célula RAW, conflito, fórmula, auditoria indisponível, falha parcial, criação de aba única e publicação explícita.
- 75 verificações SQL em PostgreSQL local descartável com migrations reais; publicação VT/Controle, preservação de planejamento, atualização do mesmo registro, permissões e auditoria.
- TypeScript, verificação Deno com SDK real, ESLint dos arquivos alterados e build.
- Conferência visual da área autenticada e teste integrado no Google real ainda pendentes. O navegador de teste estava na tela de login; nenhum login foi realizado nem escala real alterada.
