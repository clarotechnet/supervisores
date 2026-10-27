# Gerador 5x2 — primeira etapa (branch de desenvolvimento)

## Situação em 27/10/2026
- Botão **Gerar prévia 5x2** foi incluído no módulo Escalas.
- O mês escolhido na página é sempre a competência de destino. O botão fica
  disponível mesmo quando essa competência ainda não existe no Supabase.
- A geração carrega automaticamente a escala do mês anterior do mesmo setor/cidade.
  Se ela não existir, explica o impedimento sem criar dados fictícios.
- O gerador é determinístico: respeita exclusões, quotas conhecidas, folgas,
  descanso nos sábados de plantões, turnos fixos e histórico básico de rodízio.
- O cálculo agora é semanal (segunda a domingo), usando o mês anterior como
  histórico imutável e mostrando o mês seguinte como planejamento provisório.
  Ex.: 30/11–06/12 e 28/12–03/01 aparecem na prévia.
- Nenhuma geração altera diretamente a escala original ou o Google Sheets.
- Rascunhos podem ser salvos em novas revisões na tabela schedule_generation_drafts.
 - Histórico pode ser consultado/reaberto pelo botão Gerar prévia 5x2.
 - Cada salvamento tenta gerar um evento generated em schedule_generation_events.
- A prévia pode exportar **relatório Excel**, ainda não a matriz completa editável.
- Testes automatizados em tests/schedule-generator.test.ts.

## Regras
src/lib/schedule-generator-rules.ts contém os requisitos recebidos:
- RN: Adesão/Serviço, VT, MDU, Construção, Desconexão, Mossoró.
- CE: Instalação, Manutenção (Fábio T. 1 / 3 por plantão), Desconexão (sábado M. 1).
- PE: Instalação (1 por plantão), Desconexão.
- Controle RN: exclusão dos 11 nomes, com cobertura multicidade pendente.

Quantidades NÃO informadas continuam null e bloqueiam publicação:
- Fortaleza Instalação: quantidade de técnicos por plantão.
- Controle RN: quantidade por plantão distribuída por função/localidade.

## Fonte de dados e persistência
Já existe sincronização Google Sheets => schedule_uploads no Supabase.
A tabela schedule_uploads é atualmente um UPSERT por city/sector/month e
NÃO deve receber alterações manuais diretamente, pois nova sincronização poderá
sobrescrevê-las.

A migração local supabase/migrations/*_schedule_rules_and_drafts.sql cria
tabelas separadas para políticas, rascunhos e trilha de mudanças.
O usuário informou ter executado a migração em 27/10/2026. A API do projeto
Supervisores confirmou a existência das três tabelas (SELECT anônimo negado por
permissão). Falta testar INSERT/SELECT com usuário autenticado e RLS.

## Etapas ainda necessárias
1. Testar com usuário autenticado o salvamento e a leitura de rascunhos.
2. Permitir que administradores editem as políticas no banco (tabela já criada).
3. Adicionar editor de células e sistema de aprovação/publicação.
4. Complementar validação com histórico de férias e AT por intervalos e confirmar
   dias provisórios na competência seguinte; a visão semanal já foi implementada.
5. Adicionar horas/intervalos e regras legais/CCT parametrizadas pelo RH.
6. Conectar uma API externa de IA somente para interpretar comandos/regras,
   com secret no servidor. Não enviar nomes/IDs reais ao plano gratuito
   sem avaliação de privacidade.
7. Testar históricos reais de todas as áreas e comparar com escala oficial.
8. Avaliar exportação de matriz completa de horários para Excel e Sheets.

## Importante
A prévia NÃO significa conformidade trabalhista. Valida apenas parte das regras
operacionais. Se houver bloqueios, a publicação deverá ser recusada. A aprovação
humana e a validação de RH permanecem obrigatórias.
