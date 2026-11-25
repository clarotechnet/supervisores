# Revisitas da Visita técnica

O menu **Visita técnica → Revisitas** é independente do Técnico Certificado. Escolha Fortaleza ou Natal/Parnamirim e a competência pelo mês da coluna `Data` da ordem de serviço.

## Importação diária

- **Ordens de serviço:** selecione o mesmo XLSX usado para preencher o Sheets. Os cabeçalhos incluem `Data`, `Núm. Contrato`, `Número W.O`, `Núm. OS`, `Instalador`, `Cidade` e `Cód. Baixa`. `Bairro` alimenta o mapa de calor. A mesma O.S. pode ter atendimentos com outra WO ou em outro dia. O reenvio da mesma combinação de O.S., WO e data atualiza aquele atendimento. Se o arquivo traz dois registros diferentes da mesma combinação, a importação identifica as linhas para conferência.
- **Conferência com o Sheets:** em Importar O.S., também é possível usar o XLSX exportado da aba `Revisitas Imperium 2.0` com os resultados de `Prod`, `Improd` e `Expurgadas`. Nesse formato o importador seleciona a cidade e a competência escolhidas, conserva as classificações por atendimento e usa o mesmo vínculo de técnicos VT. `Improd = 1` não conta no volume de produtivas e `Prod = 1` indica revisita produtiva nessa base, salvo cancelamentos ou expurgos. Um novo lote diário sem essas colunas mantém a classificação já conferida quando a O.S./WO, data, contrato, tipo de serviço e código de baixa continuam iguais. Um novo XLSX com a classificação conferida pode atualizá-la. Não use o resumo da aba `Pagamento`, que não contém as ordens individuais. Se o arquivo exceder o limite de upload, exporte apenas o recorte em uma aba com os mesmos cabeçalhos.
- **Ordens sem baixa:** quando o XLSX indica status 1 e não traz código nem data de baixa, a prévia informa as linhas que ficarão de fora. Reimporte-as depois da baixa na origem. Um código de baixa zero já informado não é tratado como vazio. Outros registros com código ausente ou inválido precisam ser corrigidos no arquivo.
- **Dias trabalhados:** XLSX acumulado da competência, com `Técnico` e/ou `Login` e `Dias trabalhados`.
- **Média de entradas:** XLSX acumulado da competência, com `Técnico` e/ou `Login` e `Média de entradas` (ou `Média hora`). A média pode ser hora do Excel ou `HH:mm[:ss]`.

A importação mostra cidade, competência e volume antes de gravar. Prefira incluir o login nas duas bases auxiliares: ele une os dias e as entradas da mesma pessoa.
A leitura aceita arquivos XLSX com os elementos da planilha gravados com ou sem prefixo de namespace XML, sem alterar as células importadas.

## Equipe VT

O cadastro de **Técnico Certificado → Supervisores** define a equipe pelo login, setor Visita técnica e cidade. A lista de técnicos usa esse cadastro; pagamentos são agrupados por login e cruzados com os dias e os horários do mesmo login. Um nome da O.S. pode ser identificado pelo próprio login, pelo nome completo ou por abreviação sem ambiguidade. Diferenças de grafia exigem confirmação quando houver um único candidato VT no cadastro. O vínculo só pode confirmar esse candidato, sem escolher outro técnico para a O.S. Um VT identificado, mas com dados auxiliares ausentes ou conflitantes, continua pendente. Vinculações confirmadas valem para a prévia até o fechamento.

As confirmações manuais são guardadas neste navegador por conta, cidade e competência. Recarregar a página não as apaga. Outro navegador precisa da própria confirmação. **Desfazer vínculo** remove a confirmação guardada. O painel só aplica o vínculo se o cadastro VT atual ainda corresponder ao técnico sugerido.

O histórico de todas as ordens do contrato é analisado antes desse filtro. Uma O.S. de outro setor ainda pode ser o retorno de uma O.S. da equipe VT; ela não entra como atendimento da equipe nos gráficos, no detalhamento ou nos pagamentos. As ordens importadas são mantidas na base.

Nunca inclua cliente, telefone ou endereço residencial nas bases auxiliares.

## Gráficos e exportação

- A visão geral mostra O.S. e revisitas produtivas acumuladas no recorte e produtividade por técnico. Clique no técnico para ver contratos distintos por dia, O.S. produtivas, improdutivas, canceladas, expurgadas e revisitas produtivas. O detalhamento abaixo usa o mesmo recorte; busca e classificação atuam só na tabela. Dias sem O.S. na base da cidade ficam sem ponto no gráfico.
- Em Ordens de serviço, clicar em um indicador seleciona sua classificação na tabela. A taxa abre as revisitas produtivas que compõem o numerador; o total ou um segundo clique no indicador ativo remove a classificação sem alterar o recorte de cidade, técnico e datas.
- O mapa conta as revisitas produtivas na data e no bairro da O.S. original. A posição é aproximada, calculada a partir do bairro, não de endereços ou de GPS. Registros sem bairro mapeável continuam nos totais. Abreviações conhecidas são normalizadas por município em `src/lib/vt-revisitas-geography.ts`.
- O mapa de ruas usa [OpenStreetMap](https://www.openstreetmap.org/copyright). Com a camada de ruas indisponível, o painel continua nas malhas do IBGE. PDF e PNG usam essa base cartográfica local para exportar sem depender dos mosaicos externos. Os arquivos trazem o logo, o recorte ativo (cidade, datas, técnico e bairro) e gráficos agregados, sem a lista de contratos e ordens individuais.
- A base simplificada de Fortaleza, Natal e Parnamirim é gerada em `src/lib/vt-geography.json` pelos [bairros do Censo 2022](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/bairros/shp/BR/) e pelas malhas 2024 do [Ceará](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2024/UFs/CE/) e do [Rio Grande do Norte](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2024/UFs/RN/). Para atualizar, coloque numa pasta o ZIP de bairros `BR_bairros_CD2022.zip` e os ZIPs `*_Municipios_2024.zip` e `*_UF_2024.zip` de CE e RN. Execute `python scripts/build-vt-geography.py <pasta> src/lib/vt-geography.json` com PyShp e Shapely. Não é uma etapa do build da aplicação.

## Cálculo e fechamento

Os códigos de baixa 0 (cancelamento) e 1 (revisita cancelada) ficam em O.S. canceladas. Entram no total do recorte, mas não em produtivas, improdutivas, revisitas produtivas ou expurgadas. Nos XLSX sem classificação do Sheets, 570, 203, 204 e 112 entram em expurgo automático apenas quando há uma próxima O.S. do mesmo contrato. O expurgo também considera limpeza de ruído indoor na O.S. ou na próxima e revisita cancelada na próxima. Sem expurgo, os códigos até 400 são improdutivos. O retorno é procurado por contrato e data, não pela posição física da linha. Nas O.S. conferidas pelo XLSX do Sheets, a classificação de origem vale para os totais e pagamentos. A taxa divide revisitas produtivas pelas O.S. produtivas. O cálculo do pagamento não usa `QT_REVISITA` nem os pontos do Técnico Certificado.

Revise as regras para a cidade e competência. A prévia de pagamentos sempre usa o mês inteiro: filtros de técnico, bairro ou data não reduzem o fechamento. O fechamento exige as três bases e os dados de pagamento completos para os técnicos elegíveis. Guarda regras e valores do momento em uma cópia que não pode ser alterada pelo aplicativo. Importar ou fechar exige um administrador ativo; o banco também valida permissão, revisão e imutabilidade.

## Ativação

O aplicativo espera a migração `supabase/migrations/20261119181119_add_vt_revisita_periodos.sql` e, para importar O.S. com a nova identificação por atendimento, a migração `supabase/migrations/20261123133200_vt_revisitas_identificar_atendimentos.sql`. A segunda migração não altera dados por si só: na próxima importação de O.S. em uma competência aberta, o banco combina os atendimentos já salvos e os novos pela mesma chave. Nenhuma migração importa ou fecha períodos automaticamente.
