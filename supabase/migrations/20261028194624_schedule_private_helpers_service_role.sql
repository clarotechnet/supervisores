-- Corrige a cadeia SECURITY INVOKER usada pelas Edge Functions de escalas.
-- As fachadas public.* chamam estes três helpers do schema private.
-- Não publica escalas, não muda perfis/autorizações e não altera o Sheets.
begin;

grant usage on schema private to service_role;
grant execute on function private.is_admin(uuid),
  private.can_access_schedules(uuid),
  private.can_manage_schedules(uuid)
to service_role;

commit;
