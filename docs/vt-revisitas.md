# Revisitas da Visita técnica

O menu **Visita técnica → Revisitas** é independente do Técnico Certificado. Escolha Fortaleza ou Natal/Parnamirim e a competência pelo mês da coluna `Data` da ordem de serviço.

## Importação diária

- **Ordens de serviço:** selecione o mesmo XLSX usado para preencher o Sheets. Os cabeçalhos incluem `Data`, `Núm. Contrato`, `Número W.O`, `Núm. OS`, `Instalador`, `Cidade` e `Cód. Baixa`. `Bairro` alimenta o mapa de calor. Para o mesmo mês, a O.S. existente é atualizada sem duplicar as ordens distintas de uma mesma WO.
- **Dias trabalhados:** XLSX acumulado da competência, com `Técnico` e/ou `Login` e `Dias trabalhados`.
- **Média de entradas:** XLSX acumulado da competência, com `Técnico` e/ou `Login` e `Média de entradas` (ou `Média hora`). A média pode ser hora do Excel ou `HH:mm[:ss]`.

A importação mostra cidade, competência e volume antes de gravar. Prefira incluir o login nas duas bases auxiliares: ele une os dias e as entradas da mesma pessoa. Em **Pagamentos**, o nome da O.S. é cruzado por login, nome completo ou abreviação que corresponda a um único cadastro. Diferenças de grafia aparecem como sugestões; o administrador precisa confirmar o cadastro para calcular o pagamento. Dados faltantes ou em conflito permanecem pendentes, assim como duas linhas de pagamento vinculadas ao mesmo cadastro. Os vínculos manuais são usados na prévia da cidade e do mês enquanto a tela está aberta; ao fechar, o cadastro vinculado é guardado junto com os valores.

Nunca inclua cliente, telefone ou endereço residencial nas bases auxiliares. O mapa de calor agrupa por bairro e dia; os arquivos de O.S. não contêm coordenadas.

## Cálculo e fechamento

O corte de improdutividade é código de baixa até 400, inclusive, com o tratamento de expurgo da planilha estudada. O retorno é procurado por contrato e data, não pela posição física da linha. A taxa divide revisitas produtivas pelas O.S. produtivas. O cálculo do pagamento não usa `QT_REVISITA` nem os pontos do Técnico Certificado.

Revise as regras para a cidade e competência. A prévia de pagamentos sempre usa o mês inteiro: filtros de técnico, bairro ou data não reduzem o fechamento. O fechamento exige as três bases e os dados de pagamento completos para os técnicos elegíveis. Guarda regras e valores do momento em uma cópia que não pode ser alterada pelo aplicativo. Importar ou fechar exige um administrador ativo; o banco também valida permissão, revisão e imutabilidade.

## Ativação

O aplicativo espera a migração `supabase/migrations/20261119181119_add_vt_revisita_periodos.sql`. Sem ela, a tela informa que a base não está instalada e bloqueia gravações. A migração não altera nenhuma tabela do Técnico Certificado nem importa ou fecha períodos automaticamente.
