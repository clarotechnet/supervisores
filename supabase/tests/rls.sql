\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000a001', 'gestor.rls@teste.local', 'authenticated', 'authenticated', '{"full_name":"Gestor RLS","sector_slug":"natal"}', now(), now()),
  ('00000000-0000-0000-0000-00000000a002', 'natal.rls@teste.local', 'authenticated', 'authenticated', '{"full_name":"Supervisor Natal","sector_slug":"natal"}', now(), now()),
  ('00000000-0000-0000-0000-00000000a003', 'recife.rls@teste.local', 'authenticated', 'authenticated', '{"full_name":"Supervisor Recife","sector_slug":"recife"}', now(), now()),
  ('00000000-0000-0000-0000-00000000a004', 'gestor.pendente@teste.local', 'authenticated', 'authenticated', '{"full_name":"Gestor Pendente","sector_slug":"gestor"}', now(), now());

select case when exists (
  select 1
  from public.profiles p
  join public.sectors s on s.id = p.sector_id
  where p.id = '00000000-0000-0000-0000-00000000a004'
    and s.slug = 'gestor'
    and p.role = 'supervisor'
    and p.status = 'pending'
) then true else false end as gestor_request_is_safe \gset
\if :gestor_request_is_safe
\else
  \echo 'Falha: solicitacao do setor Gestor nao foi criada como supervisor pendente'
  \quit 1
\endif

select private.bootstrap_admin_by_email('gestor.rls@teste.local');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
update public.profiles
set status = 'active', approved_at = now(), approved_by = '00000000-0000-0000-0000-00000000a001'
where id in ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a003');
reset role;

insert into public.daily_checklists (id, user_id, sector_id, checklist_date)
values
  ('10000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a002', (select id from public.sectors where slug = 'natal'), current_date),
  ('10000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a003', (select id from public.sectors where slug = 'recife'), current_date);

insert into public.daily_task_records (checklist_id, user_id, sector_id, title, group_name, scheduled_date, scheduled_time)
values
  ('10000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a002', (select id from public.sectors where slug = 'natal'), 'Teste Natal', 'RLS', current_date, '08:00'),
  ('10000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a003', (select id from public.sectors where slug = 'recife'), 'Teste Recife', 'RLS', current_date, '08:00');

insert into public.daily_task_records (checklist_id, user_id, sector_id, title, group_name, scheduled_date, scheduled_time)
values ('10000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a002', (select id from public.sectors where slug = 'natal'), 'Teste Natal 2', 'RLS', current_date, '08:10');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', true);

-- O supervisor enxerga somente seu perfil, seus registros e os modelos de seu setor.
select case when (select count(*) from public.profiles) = 1 then true else false end as supervisor_profile_isolated \gset
\if :supervisor_profile_isolated
\else
  \echo 'Falha: supervisor acessou outro perfil'
  \quit 1
\endif

select case when (select count(*) from public.daily_task_records) = 2 then true else false end as supervisor_records_isolated \gset
\if :supervisor_records_isolated
\else
  \echo 'Falha: supervisor acessou registros de outro setor'
  \quit 1
\endif

select public.reorder_daily_tasks(array(
  select id from public.daily_task_records order by title desc
));

select case when (
  select title from public.daily_task_records order by display_order limit 1
) = 'Teste Natal 2' then true else false end as supervisor_reordered_own_tasks \gset
\if :supervisor_reordered_own_tasks
\else
  \echo 'Falha: supervisor nao conseguiu reordenar a propria rotina'
  \quit 1
\endif

select public.move_daily_task(
  (select id from public.daily_task_records where title = 'Teste Natal 2'),
  'completed',
  array(select id from public.daily_task_records order by display_order)
);

select case when exists (
  select 1
  from public.daily_task_records
  where title = 'Teste Natal 2'
    and status = 'completed'
    and completed_at is not null
) then true else false end as supervisor_moved_task_to_done \gset
\if :supervisor_moved_task_to_done
\else
  \echo 'Falha: supervisor nao conseguiu arrastar atividade para concluidas'
  \quit 1
\endif

select public.move_daily_task(
  (select id from public.daily_task_records where title = 'Teste Natal 2'),
  'reopened',
  array(select id from public.daily_task_records order by display_order)
);

select case when exists (
  select 1
  from public.daily_task_records
  where title = 'Teste Natal 2'
    and status = 'reopened'
    and completed_at is null
) then true else false end as supervisor_moved_task_back_to_pending \gset
\if :supervisor_moved_task_back_to_pending
\else
  \echo 'Falha: supervisor nao conseguiu reabrir atividade arrastando'
  \quit 1
\endif

do $$
begin
  begin
    perform public.reorder_daily_tasks(array[
      (select id from public.daily_task_records limit 1),
      (select id from public.daily_task_records where user_id = '00000000-0000-0000-0000-00000000a003' limit 1)
    ]);
    raise exception 'A ordenacao de atividade alheia deveria ter sido bloqueada';
  exception when others then
    if sqlerrm = 'A ordenacao de atividade alheia deveria ter sido bloqueada' then
      raise;
    end if;
  end;
end;
$$;

do $$
begin
  begin
    perform public.move_daily_task(
      (select id from public.daily_task_records limit 1),
      'completed',
      array[
        (select id from public.daily_task_records limit 1),
        'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
      ]
    );
    raise exception 'A movimentacao com atividade alheia deveria ter sido bloqueada';
  exception when others then
    if sqlerrm = 'A movimentacao com atividade alheia deveria ter sido bloqueada' then
      raise;
    end if;
  end;
end;
$$;

select case when (select count(*) from public.task_templates) = 20 then true else false end as supervisor_templates_isolated \gset
\if :supervisor_templates_isolated
\else
  \echo 'Falha: supervisor acessou modelos de outro setor'
  \quit 1
\endif

-- A tentativa de elevar o próprio papel deve falhar no gatilho de proteção.
do $$
begin
  begin
    update public.profiles set role = 'admin' where id = (select auth.uid());
    raise exception 'A elevação de papel deveria ter sido bloqueada';
  exception
    when others then
      if exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') then
        raise;
      end if;
  end;
end;
$$;

insert into public.conversation_messages (supervisor_id, sender_id, sender_role, body)
values ((select auth.uid()), (select auth.uid()), 'supervisor', 'Mensagem do supervisor Natal');

-- O supervisor pode criar para si, mas não para outra pessoa.
insert into public.assigned_tasks (assigned_to, assigned_by, sector_id, title, scheduled_date, due_time)
values ((select auth.uid()), (select auth.uid()), public.user_sector((select auth.uid())), 'Tarefa própria RLS', current_date, '09:00');

select case when (select count(*) from public.notifications) = 0 then true else false end as own_task_has_no_notification \gset
\if :own_task_has_no_notification
\else
  \echo 'Falha: tarefa propria gerou notificacao indevida'
  \quit 1
\endif

do $$
begin
  begin
    insert into public.assigned_tasks (assigned_to, assigned_by, sector_id, title, scheduled_date, due_time)
    values ('00000000-0000-0000-0000-00000000a003', (select auth.uid()), (select id from public.sectors where slug = 'recife'), 'Tarefa indevida', current_date, '09:00');
    raise exception 'A atribuição para outro usuário deveria ter sido bloqueada';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);

-- O gestor vê tudo e consegue delegar.
select case when (select count(*) from public.daily_task_records) = 3 then true else false end as admin_sees_all \gset
\if :admin_sees_all
\else
  \echo 'Falha: gestor não acessou todos os registros'
  \quit 1
\endif

insert into public.assigned_tasks (assigned_to, assigned_by, sector_id, title, scheduled_date, due_time)
values ('00000000-0000-0000-0000-00000000a003', (select auth.uid()), (select id from public.sectors where slug = 'recife'), 'Tarefa delegada RLS', current_date, '10:00');

insert into public.conversation_messages (supervisor_id, sender_id, sender_role, body)
values ('00000000-0000-0000-0000-00000000a003', (select auth.uid()), 'admin', 'Mensagem do gestor para Recife');

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a003', true);

select case when exists (
  select 1 from public.notifications
  where recipient_id = (select auth.uid())
    and type = 'task_assigned'
    and message = 'Tarefa delegada RLS'
    and read_at is null
) then true else false end as delegated_task_has_notification \gset
\if :delegated_task_has_notification
\else
  \echo 'Falha: tarefa delegada nao gerou notificacao para o supervisor'
  \quit 1
\endif

update public.notifications
set read_at = now()
where recipient_id = (select auth.uid()) and read_at is null;

select case when not exists (
  select 1 from public.notifications
  where recipient_id = (select auth.uid()) and read_at is null
) then true else false end as recipient_can_mark_notification_read \gset
\if :recipient_can_mark_notification_read
\else
  \echo 'Falha: supervisor nao conseguiu marcar notificacao como lida'
  \quit 1
\endif

insert into public.conversation_messages (supervisor_id, sender_id, sender_role, body)
values ((select auth.uid()), (select auth.uid()), 'supervisor', 'Resposta do supervisor Recife');

select case when (select count(*) from public.conversation_messages) = 2
then true else false end as supervisor_conversation_isolated \gset
\if :supervisor_conversation_isolated
\else
  \echo 'Falha: supervisor acessou conversa de outro supervisor'
  \quit 1
\endif

update public.conversation_messages
set read_at = now()
where supervisor_id = (select auth.uid())
  and sender_id is distinct from (select auth.uid())
  and read_at is null;

select case when exists (
  select 1 from public.conversation_messages
  where supervisor_id = (select auth.uid())
    and sender_role = 'admin'
    and read_at is not null
) then true else false end as supervisor_marked_manager_message_read \gset
\if :supervisor_marked_manager_message_read
\else
  \echo 'Falha: supervisor nao conseguiu marcar mensagem como lida'
  \quit 1
\endif

reset role;

-- A exclusão da conta preserva o histórico e o nome do responsável.
delete from auth.users where id = '00000000-0000-0000-0000-00000000a002';
select case when exists (
  select 1 from public.daily_task_records
  where user_id is null and supervisor_name = 'Supervisor Natal'
) then true else false end as deletion_preserves_history \gset
\if :deletion_preserves_history
\else
  \echo 'Falha: exclusão apagou o histórico'
  \quit 1
\endif

rollback;

\echo 'RLS_OK'
