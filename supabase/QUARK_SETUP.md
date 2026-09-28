# Configuração do módulo Quark

O módulo foi preparado para o projeto Supabase `rwstmomeldwrjmczrmnp` (`supervisortechnet`).
Não use as credenciais do Quark no frontend ou em arquivos versionados.

## Publicação

1. Vincule a CLI ao projeto correto:

   ```powershell
   npx supabase link --project-ref rwstmomeldwrjmczrmnp
   ```

2. Aplique as migrations:

   ```powershell
   npx supabase db push
   ```

3. Cadastre um token Quark novo em **Edge Function Secrets**, com o nome
   `QUARK_AUTH_TOKEN`, ou pela CLI:

   ```powershell
   npx supabase secrets set QUARK_AUTH_TOKEN=COLE_O_TOKEN_NOVO_AQUI --project-ref rwstmomeldwrjmczrmnp
   ```

4. Publique as funções autenticadas:

   ```powershell
   npx supabase functions deploy quark-sync --project-ref rwstmomeldwrjmczrmnp
   npx supabase functions deploy quark-location-sync --project-ref rwstmomeldwrjmczrmnp
   ```

A função `quark-sync` atualiza cadastro, espelho e banco de horas. A
`quark-location-sync` consulta sob demanda `/v1/pontos/colaborador/{id}`
para carregar as coordenadas do colaborador selecionado sem expor o token no navegador.

Depois disso, um gestor ativo poderá abrir **Quark**, usar **Atualizar dados**
e consultar os mapas diários, mensais ou do período.
O período máximo por atualização é de 60 dias.

## Escopo técnico

- **Cidade, setor e supervisor não ficam versionados no repositório.** Um gestor importa
  `dados.xlsx` pela aba **Supervisores** e as associações são gravadas em
  `quark_people_directory`, protegidas por RLS.
- O vínculo da planilha com o Quark é feito por nome normalizado; linhas sem correspondência
  são informadas ao gestor para revisão.
- Se um colaborador não estiver na planilha, ele pode ser associado manualmente na aba
  **Supervisores**.
- A **base inicial de moradias** já foi carregada da planilha enviada. Novas inclusões
  e correções ficam manuais na tela **Moradia**; a API Quark não lê nem sobrescreve esses dados.
- Banco de horas e ocorrências consideram os colaboradores associados tecnicamente,
  com ou sem moradia. Moradia é requisito somente para comparação geográfica/localizações.
- A migration `20260925105500_refresh_quark_rest_access.sql` reafirma os grants das
  tabelas Quark e solicita reload do schema do PostgREST, evitando falhas de acesso
  REST após criação/alteração das tabelas.

## Segurança

- As funções aceitam sessões ativas de gestores e supervisores.
- Os supervisores atuais são supervisores de controle e têm acesso completo ao módulo Quark.
- O papel `controller` continua sem acesso ao Quark.
- A credencial externa existe somente como secret do Supabase.
- CPF, PIS e fotos de ponto não são persistidos.
- As seis tabelas possuem RLS e ficam disponíveis somente para gestores e supervisores ativos.
- A API Quark não sobrescreve cidade, setor, supervisor nem moradia cadastrados manualmente.
