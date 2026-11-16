# Folga fixa e cobertura das escalas

A coluna **Folga fixa** é localizada pelo cabeçalho, independentemente da posição. O valor acompanha o colaborador no payload e nas revisões. Aceita dias por extenso ou abreviados, com ou sem acento. AT, férias e campos vazios não são convertidos em um dia da semana. Bases antigas sem a coluna mantêm a leitura histórica; uma coluna presente e inválida é sinalizada.

A geração mantém as marcações já preenchidas na extensão da competência anterior e fecha semanas de domingo a sábado. Dias herdados permanecem protegidos no editor, nas compensações e na API. A leitura dos cabeçalhos preserva as datas anteriores e posteriores ao mês, incluindo a virada do ano.

## Quantidades por cidade e frente

- Natal / Adesão-Serviço, desde dezembro/2026: 3 nos domingos regulares, 3 nos feriados e 10 no último domingo de cada mês.
- Natal / VT: permanecem 5 por domingo e feriado.
- Mossoró: permanece 1 por domingo e feriado.
- Recife / Instalação: permanece 1 por domingo e feriado.
- As demais frentes mantêm suas regras próprias. A política 3/3/10 não é aplicada globalmente.

O quantitativo de Adesão Natal é compartilhado entre a geração, a reanálise e a conferência de publicação. Uma revisão antiga com outra quantidade gera uma pendência; pessoas não são removidas automaticamente. O modelo estático antigo de dezembro pode conter 5 no Natal e exige revisão frente à regra atual.

## Ativação

Não exige migration SQL. No diretório `D:\sistemas\supervisores`, publicar as funções com a CLI v3:

```powershell
npx supabase functions deploy schedule-sync schedule-operational schedule-ai schedule-edit --remote=rwstmomeldwrjmczrmnp --use-api
```

O frontend foi atualizado e o build local foi gerado. Publicar pelo fluxo habitual do projeto para disponibilizar no site online.

Com a aba de dezembro atualizada no arquivo oficial configurado para cada cidade/frente, usar **Atualizar via API** antes de gerar uma nova prévia do mês seguinte. Alterações numa cópia de referência não trocam automaticamente a planilha oficial configurada.

## Conferências do Sheets

As abas Conferência e rodízio e Conferência demais áreas consultam as abas atuais pelo colaborador. Folgas mensais são separadas em fixas e outras folgas. Outras folgas podem incluir descanso semanal, feriado ou compensação e não identificam, sozinhas, o motivo do descanso.

A coluna Semanas 5x2 mostra o número de semanas completas domingo–sábado com ao menos dois descansos dentre as semanas sem afastamento, férias, falta ou dados incompletos. Não substitui uma aprovação nem altera a escala.

## Validação

651 testes Vitest (incluindo leitura de nove abas copiadas de RN e PE), 95 testes das Edge Functions, TypeScript, lint e build passaram. Os dados de referência reais foram usados apenas em arquivos temporários e não foram incluídos nos testes versionados. Nenhum deploy, SQL ou publicação de escala foi executado nesta tarefa.
