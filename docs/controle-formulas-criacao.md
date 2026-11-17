# Fórmulas na criação de abas do Controle RN

Instalado no Supabase, projeto Supervisores rwstmomeldwrjmczrmnp, em 17/11/2026. Somente a função schedule-operational foi publicada. Sem commit/push no Git e sem publicação do frontend.

Ao criar a próxima aba pelo sistema, a cópia recebe o planejamento e as fórmulas como tipos explícitos da API Google Sheets. Nomes, códigos, datas e Folga fixa continuam como texto. A limpeza afeta somente os valores da cópia e inclui todas as colunas, inclusive referências antigas depois de AO.

Com 42 colaboradores e datas de 29/11/2026 a 04/01/2027:

| Local | Cálculo |
| --- | --- |
| AN, PLATÕES | Sim se houver PLANTÃO em qualquer data exibida, inclusive continuidade |
| AO, quantidades | Quantidade de PLANTÃO somente de 01/12 a 31/12 |
| AP, Folga fixa | Referência de folga fixa preservada no final |
| Linha 45 | Total de T. 1 em cada dia |
| Linha 46 | Total de PLANTÃO em cada dia |
| A59 e A60 | Critérios T. 1 e PLANTÃO |

Equivalentes na interface em português para a primeira pessoa:

```text
AN3: =SE(CONT.SE(C3:AM3;$A$60)>0;"Sim";"Não")
AO3: =CONT.SE(E3:AI3;$A$60)
C45: =CONT.SE(C3:C44;$A$59)
C46: =CONT.SE(C3:C44;$A$60)
```

As fórmulas são transmitidas em `userEnteredValue.formulaValue`, com nomes de funções da API. As colunas e linhas não ficam fixadas em dezembro: o código usa as datas e a quantidade real de colaboradores. Com 47 pessoas, os critérios passam para A64/A65 e os totais para as linhas 50/51. Em janeiro com datas de 27/12 a 01/02, o contador mensal considera H:AL.

A coluna Folga fixa continua sendo criada quando já declarada no planejamento, preservando o comportamento anterior. Resumos e critérios não são importados como pessoas ou datas durante Atualizar via API.

Verificação local: testes unitários de dezembro/janeiro, limites de linhas/colunas e importação; teste Edge de criação com Google e banco simulados; 324 conferências de cálculo e recálculo em dois meses, com zero erros de fórmula no motor local. A execução real no Google Sheets fica para depois da autorização de publicação.

## Verificação de publicação em 17/11/2026

Função ativa: schedule-operational, versão 16. O gerador lê a localidade da planilha para usar o separador correto (ponto e vírgula em pt_BR e vírgula em en_US). Foram repetidos 30 testes unitários e 42 testes Edge, além do lint.

A aba Controle JANEIRO 27 - 5X2 (gid 2045761222) recebeu 168 fórmulas: indicadores AS/AT, Folga fixa preservada em AU e totais C45:AR46. Todas as 168 fórmulas foram recalculadas no Google Sheets e conferidas contra as marcações originais, sem divergências. Nomes, funções, datas, marcações, validações e formatos anteriores da tabela e da Folga fixa foram comparados antes/depois e preservados. Nenhuma escala foi aprovada/publicada no painel durante esta correção.
