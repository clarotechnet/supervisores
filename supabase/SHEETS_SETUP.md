# Integração Google Sheets -> Escalas

Projeto Supabase de produção: `rwstmomeldwrjmczrmnp` (`supervisortechnet`).

A tela `/escalas` continua usando `schedule_uploads` como fonte rápida de consulta.
O botão **Atualizar via API** chama a Edge Function `schedule-sync`, que lê as planilhas
Google e faz UPSERT por cidade, frente e mês. O botão **Importar Excel** continua disponível.

## Segredos locais

Os segredos do Google ficam no `.env` da raiz apenas no ambiente local. Esse arquivo é ignorado pelo Git.
Nunca use prefixo `VITE_` para essas credenciais e nunca mova esses valores para o frontend.

Variáveis esperadas:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_SHEETS_RN_MAIN_ID`
- `GOOGLE_SHEETS_RN_CONTROL_ID`
- `GOOGLE_SHEETS_CE_ID`
- `GOOGLE_SHEETS_PE_ID`
## Publicação no Supabase correto

Primeiro autentique a CLI com a conta que possui acesso ao projeto `supervisortechnet`.

```powershell
npx supabase login
npx supabase link --project-ref rwstmomeldwrjmczrmnp
```

Depois envie os mesmos segredos locais para **Edge Function Secrets**:

```powershell
npx supabase secrets set --env-file .env --project-ref rwstmomeldwrjmczrmnp
```

Publique a função autenticada:

```powershell
npx supabase functions deploy schedule-sync --project-ref rwstmomeldwrjmczrmnp
```

Os segredos online ficam no Supabase. GitHub/Git não precisa receber as credenciais do Google,
a menos que futuramente seja criado um pipeline de deploy que precise delas.

## Segurança

A função valida o JWT do usuário do próprio sistema e só aceita atualização por perfis
`admin` ou `supervisor` ativos. A `SUPABASE_SERVICE_ROLE_KEY` é fornecida pelo ambiente
da Edge Function e nunca é enviada ao navegador.
