-- Arquivamento reversível: não destrói rascunhos com histórico ou Google Sheets.
-- Não executada; aplicar no projeto rwstmomeldwrjmczrmnp depois da revisão.
alter table public.schedule_generation_drafts
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;
create index if not exists schedule_gen_drafts_active_idx
  on public.schedule_generation_drafts(city,sector,schedule_month,revision desc)
  where archived_at is null;
-- Esta coluna é atualizada com as políticas de UPDATE existentes: administrador
-- ou responsável autorizado pelo rascunho em status 'draft'.
