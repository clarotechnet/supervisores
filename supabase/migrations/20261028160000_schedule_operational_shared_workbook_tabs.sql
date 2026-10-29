-- Uma única pasta de trabalho pode conter muitas escalas por aba.
-- Preserva todos os registros operacionais legados (aba ATUALIZADA).
-- Execute no mesmo projeto Supabase do Supervisores antes do novo deploy.
begin;
alter table public.schedule_operational_sheets
  add column if not exists sheet_tab text not null default 'ATUALIZADA';
alter table public.schedule_operational_sheets
  drop constraint if exists schedule_operational_sheets_spreadsheet_id_key;
create unique index if not exists schedule_operational_spreadsheet_tab_uniq
  on public.schedule_operational_sheets(spreadsheet_id,sheet_tab);
commit;
