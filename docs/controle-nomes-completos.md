# Controle RN: nomes completos

A aba mensal de dezembro passou a usar os nomes completos das mesmas 42 pessoas. O cadastro operacional aprovado ainda usava as abreviações do modelo inicial. Como a identidade é validada pelo nome, o sincronizador corretamente recusava a diferença com 409.

Foi aplicada uma correção de identificação somente na versão vinculada a Controle DEZEMBRO 26 - 5X2 e na respectiva escala oficial. A correspondência de 42 para 42 veio da aba conferida, sem aproximação por texto ou posição da linha. As datas, códigos, funções, logins, ordem e quantidades dos quatro payloads foram comparados antes/depois. Somente os nomes mudaram. A política persistida de exclusão de plantões também passou a referenciar as mesmas pessoas pelo nome completo.

A operação foi registrada em schedule_generation_events como control_full_names_corrected, com a fotografia anterior dos registros. Versões históricas, outros meses, outras frentes e a planilha Google não foram escritos.

O arquivo scripts/repair-control-full-names-202612.sql documenta a operação pontual já executada. Ele exige os IDs e hashes conferidos e interrompe se a escala mudar; não é um comando de sincronização recorrente.

O gerador inicial agora resolve explicitamente as abreviações do cadastro de novembro e emite nomes completos. A transcrição original do modelo continua disponível para conferência. As exclusões de plantão e sua edição reconhecem as duas formas somente no Controle RN. Uma pessoa repetida na origem com nome curto e completo bloqueia a geração por identificação ambígua.

Após recarregar a página, Atualizar via API passa a comparar os nomes completos da aba com o cadastro corrigido. Essa ação continua sendo a responsável por trazer as alterações de dias, funções e Folga fixa do Sheets.

Origem conferida: https://docs.google.com/spreadsheets/d/1fRg2brUmUBFV0EX7jNDZebEJ7AssI87AYC3gS1AgJ64/edit?gid=676818445#gid=676818445
