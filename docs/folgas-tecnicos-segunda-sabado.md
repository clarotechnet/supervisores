# Folgas dos técnicos de segunda a sábado

Regra da gestão em 29/10/2026. O modelo inicial de dezembro RN foi ajustado no arquivo Google de referência já existente, sem criar outro workbook.

Adesão Natal: a base da porcentagem contém somente pessoas com login, disponíveis no mês e não impedidas de plantão. Atestados/afastamentos durante todo o mês são preservados. Para 66 logins, 4 AT e 5 impedidos com login, a base é 57; sábado recebe round(57 × 25%) = 14. Os 43 restantes se dividem em segunda 9, terça 9, quarta 9, quinta 8 e sexta 8. Os 17 demais ativos continuam na escala, em distribuição separada; não entram no denominador. Nenhum nome é removido.

Plantões da Adesão: 3 nos domingos comuns, 10 no último domingo da competência e 5 nos feriados. O último domingo é calculado para cada mês. No modelo dezembro: 06/12 = 3, 13/12 = 3, 20/12 = 3, 25/12 = 5 e 27/12 = 10. Os seis impedidos de plantão permanecem impedidos. Técnicos sem login não entram em plantões da Adesão nem nas sugestões de substituição da IA.

As cinco outras abas do modelo RN distribuem os ativos entre segunda e sábado, com diferenças de no máximo uma pessoa por dia. Mantêm suas coberturas e turnos: VT 5 por evento; MDU somente 1 no feriado útil; Mossoró 1 por evento; Construção e Desconexão sem plantão, com M. 2 no sábado trabalhado. Regras de CE, PE e Controle operacional não recebem a porcentagem da Adesão.

As matrizes e as duas abas de conferência do Google foram atualizadas somente nos valores necessários. Fórmulas, validações, cores, nomes, logins e afastamentos foram preservados. Compensações permanecem no mesmo período domingo–sábado, incluindo continuidade provisória até 02/01. Dias explícitos vindos do mês anterior são preservados; divergências de cobertura exigem revisão, sem sobrescrita automática.

A referência local inicial RN usa rn-2026-12-5x2-v2. Novas prévias recebem a regra; revisões já salvas conservam seu histórico. A análise não conta Sem informação como trabalho e mantém avisos de histórico incompleto.

Validação: 354 testes Vitest em 51 arquivos, TypeScript, ESLint dos arquivos alterados, git diff --check e build passaram. As oito abas Google foram relidas: 993 células planejadas, zero diferenças inesperadas, nenhuma validação alterada ou erro de fórmula. A revisão visual nativa mantém o layout existente.

Ativação do código: atualizar o frontend. Esta etapa não exige SQL novo nem alteração/deploy de Edge Functions. Nenhum commit, push, merge, deploy, aprovação ou publicação de escala foi executado nesta mudança. O arquivo de referência não substitui a fonte oficial configurada no Atualizar via API; gere/revise uma nova versão e publique somente por ação explícita da gestão.
