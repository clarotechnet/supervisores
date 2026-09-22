import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const seed = readFileSync(
  new URL(
    "../supabase/migrations/20260803121238_31adc0af-4afd-46f8-97f0-70781636acb0.sql",
    import.meta.url,
  ),
  "utf8",
);
const security = readFileSync(
  new URL(
    "../supabase/migrations/20260803121105_7f4f5f0f-710b-4a08-80f5-7ed35f2e2aa8.sql",
    import.meta.url,
  ),
  "utf8",
);
const extensions = readFileSync(
  new URL(
    "../supabase/migrations/20260803134109_add_gestor_and_assigned_tasks.sql",
    import.meta.url,
  ),
  "utf8",
);
const gestorSignup = readFileSync(
  new URL("../supabase/migrations/20260803144111_allow_gestor_signup_request.sql", import.meta.url),
  "utf8",
);
const notifications = readFileSync(
  new URL(
    "../supabase/migrations/20260803175155_add_persistent_task_notifications.sql",
    import.meta.url,
  ),
  "utf8",
);
const conversations = readFileSync(
  new URL(
    "../supabase/migrations/20260804111102_add_task_ordering_and_conversations.sql",
    import.meta.url,
  ),
  "utf8",
);
const taskMoves = readFileSync(
  new URL(
    "../supabase/migrations/20260804113148_move_daily_task_between_columns.sql",
    import.meta.url,
  ),
  "utf8",
);
const separatedConversations = readFileSync(
  new URL(
    "../supabase/migrations/20260805180000_separate_conversations_by_manager.sql",
    import.meta.url,
  ),
  "utf8",
);
const hardenedConversations = readFileSync(
  new URL(
    "../supabase/migrations/20260805180717_harden_manager_supervisor_conversations.sql",
    import.meta.url,
  ),
  "utf8",
);
const isolatedManagerRoutines = readFileSync(
  new URL(
    "../supabase/migrations/20260810143528_isolate_manager_routine_templates.sql",
    import.meta.url,
  ),
  "utf8",
);
const noteMentions = readFileSync(
  new URL(
    "../supabase/migrations/20260810150829_add_task_note_supervisor_mentions.sql",
    import.meta.url,
  ),
  "utf8",
);
const noteMentionTitles = readFileSync(
  new URL(
    "../supabase/migrations/20260810152618_add_task_title_to_note_mentions.sql",
    import.meta.url,
  ),
  "utf8",
);
const controllerRole = readFileSync(
  new URL("../supabase/migrations/20260922124256_add_controller_role.sql", import.meta.url),
  "utf8",
);
const schedules = readFileSync(
  new URL("../supabase/migrations/20260922124401_create_schedule_uploads.sql", import.meta.url),
  "utf8",
);
const scheduleCollaboration = readFileSync(
  new URL(
    "../supabase/migrations/20260922135118_add_schedule_suggestions_and_date_notes.sql",
    import.meta.url,
  ),
  "utf8",
);
const scheduleMutationPermissions = readFileSync(
  new URL(
    "../supabase/migrations/20260922141345_restrict_schedule_mutations_to_managers_and_supervisors.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("carga inicial", () => {
  const codes = [...seed.matchAll(/^\('((?:ntl|desc|ftz|rec|mdu|mnt)-[^']+)'/gm)].map(
    (match) => match[1],
  );

  it("contém exatamente 109 atividades", () => {
    expect(codes).toHaveLength(109);
  });

  it("não repete identificadores", () => {
    expect(new Set(codes).size).toBe(109);
  });

  it("preserva os seis setores operacionais e o setor Gestor", () => {
    for (const slug of ["natal", "desc", "fortaleza", "recife", "mdu", "manutencao"]) {
      expect(seed).toContain(`'${slug}'`);
    }
    expect(extensions).toContain("'gestor', 'Gestor', 'GST'");
  });

  it("mantém a programação semanal específica do MDU", () => {
    expect(seed).toContain("'mdu-seg-01','mdu'");
    expect(seed).toContain("'mdu-seg-01','mdu','Rota diária','Segunda-feira','08:00','{1}'");
    expect(seed).toContain("'mdu-sab-01','mdu'");
    expect(seed).toContain("'mdu-sab-01','mdu','Medição semanal");
  });
});

describe("contrato de segurança", () => {
  it("ativa RLS nas tabelas operacionais", () => {
    for (const table of [
      "sectors",
      "profiles",
      "task_templates",
      "daily_checklists",
      "daily_task_records",
      "audit_logs",
    ]) {
      expect(security).toContain(`alter table public.${table} enable row level security`);
    }
    expect(extensions).toContain("alter table public.assigned_tasks enable row level security");
    expect(notifications).toContain("alter table public.notifications enable row level security");
    expect(conversations).toContain(
      "alter table public.conversation_messages enable row level security",
    );
  });

  it("separa políticas próprias e administrativas", () => {
    expect(extensions).toContain('create policy "records_select_authorized"');
    expect(extensions).toContain('create policy "records_update_authorized"');
    expect(extensions).toContain('create policy "assigned_tasks_insert_authorized"');
    expect(extensions).toContain('create policy "assigned_tasks_delete_authorized"');
  });

  it("publica novas atribuições no Realtime", () => {
    expect(extensions).toContain(
      "alter publication supabase_realtime add table public.assigned_tasks",
    );
  });

  it("protege e publica notificações persistentes", () => {
    expect(notifications).toContain('create policy "notifications_select_own"');
    expect(notifications).toContain('create policy "notifications_update_own"');
    expect(notifications).toContain("grant update (read_at) on public.notifications");
    expect(notifications).toContain(
      "alter publication supabase_realtime add table public.notifications",
    );
  });

  it("gera a notificação de delegação por gatilho privado", () => {
    expect(notifications).toContain("private.notify_assigned_task()");
    expect(notifications).toContain("security definer");
    expect(notifications).toContain(
      "revoke all on function private.notify_assigned_task() from public, anon, authenticated",
    );
    expect(notifications).toContain("after insert on public.assigned_tasks");
  });

  it("protege as conversas entre gestor e supervisor", () => {
    expect(conversations).toContain('create policy "conversation_messages_select_participants"');
    expect(conversations).toContain('create policy "conversation_messages_insert_participants"');
    expect(conversations).toContain("grant update (read_at) on public.conversation_messages");
    expect(conversations).toContain(
      "alter publication supabase_realtime add table public.conversation_messages",
    );
  });

  it("separa cada conversa pelo par gestor e supervisor", () => {
    expect(separatedConversations).toContain("add column if not exists manager_id uuid");
    expect(separatedConversations).toContain("manager_id = (select auth.uid())");
    expect(separatedConversations).toContain("supervisor_id = (select auth.uid())");
    expect(separatedConversations).toContain("list_my_conversation_managers");
    expect(separatedConversations).toContain(
      "drop function if exists public.is_conversation_participant(uuid, uuid)",
    );
  });

  it("reaplica o isolamento mesmo quando a migration anterior já foi executada", () => {
    expect(hardenedConversations).toContain("manager_id = (select auth.uid())");
    expect(hardenedConversations).toContain("supervisor_id = (select auth.uid())");
    expect(hardenedConversations).toContain("set search_path = ''");
    expect(hardenedConversations).toContain(
      "drop function if exists public.is_conversation_participant(uuid, uuid)",
    );
  });

  it("isola os modelos da rotina pessoal pelo gestor proprietário", () => {
    expect(isolatedManagerRoutines).toContain("add column if not exists owner_id uuid");
    expect(isolatedManagerRoutines).toContain("owner_id = (select auth.uid())");
    expect(isolatedManagerRoutines).toContain("owner_id is null");
    expect(isolatedManagerRoutines).toContain("slug = 'gestor'");
    expect(isolatedManagerRoutines).toContain(
      'create policy "templates_admin_update" on public.task_templates',
    );
  });

  it("permite somente ao gestor marcar supervisor em observação da própria rotina", () => {
    expect(noteMentions).toContain("mentioned_supervisor_id uuid");
    expect(noteMentions).toContain("new.user_id is distinct from caller_id");
    expect(noteMentions).toContain("private.protect_task_note_mention()");
    expect(noteMentions).toContain("private.notify_task_note_mention()");
    expect(noteMentions).toContain("'task_note_mention'");
    expect(noteMentions).toContain("revoke all on function private.notify_task_note_mention()");
  });

  it("copia o nome da atividade para a notificação sem expor a rotina do gestor", () => {
    expect(noteMentionTitles).toContain(
      "create or replace function private.notify_task_note_mention()",
    );
    expect(noteMentionTitles).toContain("'task_title', new.title");
    expect(noteMentionTitles).toContain("notification.entity_id = record.id");
    expect(noteMentionTitles).toContain(
      "revoke all on function private.notify_task_note_mention()",
    );
  });

  it("restringe a ordenação à rotina do próprio usuário", () => {
    expect(conversations).toContain("security invoker");
    expect(conversations).toContain("record.user_id is distinct from caller_id");
    expect(conversations).toContain(
      "grant execute on function public.reorder_daily_tasks(uuid[]) to authenticated",
    );
  });

  it("move atividades entre colunas em uma operação protegida", () => {
    expect(taskMoves).toContain("security invoker");
    expect(taskMoves).toContain("record.user_id = caller_id");
    expect(taskMoves).toContain("record.checklist_id is distinct from source_checklist_id");
    expect(taskMoves).toContain("when p_target_status = 'completed'");
    expect(taskMoves).toContain(
      "grant execute on function public.move_daily_task(uuid, public.task_status, uuid[])\n  to authenticated",
    );
  });

  it("permite solicitar o setor Gestor sem conceder acesso administrativo", () => {
    expect(gestorSignup).toContain(
      "where slug = nullif(new.raw_user_meta_data ->> 'sector_slug', '')",
    );
    expect(gestorSignup).not.toContain("slug <> 'gestor'");
    expect(gestorSignup).toContain("'supervisor',");
    expect(gestorSignup).toContain("'pending'");
  });

  it("mantém o bootstrap do admin fora do schema público", () => {
    expect(extensions).toContain("private.bootstrap_admin_by_email");
    expect(extensions).toContain("revoke all on schema private from public, anon, authenticated");
  });

  it("cria o controlador e mantém seu acesso isolado da rotina", () => {
    expect(controllerRole).toContain("add value if not exists 'controller'");
    expect(schedules).toContain("requested_role = 'controller'");
    expect(schedules).toContain(
      "p.role in ('supervisor'::public.app_role, 'admin'::public.app_role)",
    );
    expect(schedules).toContain(
      "p.role in ('controller'::public.app_role, 'admin'::public.app_role)",
    );
  });

  it("protege a tabela de escalas por RLS e pelo escopo cidade, setor e mês", () => {
    expect(schedules).toContain("create table public.schedule_uploads");
    expect(schedules).toContain("unique (city, sector, schedule_month)");
    expect(schedules).toContain("alter table public.schedule_uploads enable row level security");
    expect(schedules).toContain('create policy "schedule_uploads_select_authorized"');
    expect(schedules).toContain('create policy "schedule_uploads_insert_authorized"');
    expect(schedules).toContain('create policy "schedule_uploads_update_authorized"');
    expect(schedules).toContain('create policy "schedule_uploads_delete_authorized"');
  });

  it("isola sugestões por controlador e permite a gestão administrativa", () => {
    expect(scheduleCollaboration).toContain("create table public.schedule_suggestions");
    expect(scheduleCollaboration).toContain(
      "alter table public.schedule_suggestions enable row level security",
    );
    expect(scheduleCollaboration).toContain("author_id = (select auth.uid())");
    expect(scheduleCollaboration).toContain("public.is_controller((select auth.uid()))");
    expect(scheduleCollaboration).toContain(
      'create policy "schedule_suggestions_select_authorized"',
    );
    expect(scheduleCollaboration).toContain(
      'create policy "schedule_suggestions_insert_controller"',
    );
    expect(scheduleCollaboration).toContain('create policy "schedule_suggestions_update_admin"');
    expect(scheduleCollaboration).toContain('create policy "schedule_suggestions_delete_admin"');
  });

  it("limita a escrita de observações das datas aos gestores", () => {
    expect(scheduleCollaboration).toContain("create table public.schedule_date_notes");
    expect(scheduleCollaboration).toContain(
      "alter table public.schedule_date_notes enable row level security",
    );
    expect(scheduleCollaboration).toContain("unique (schedule_upload_id, note_date)");
    expect(scheduleCollaboration).toContain(
      'create policy "schedule_date_notes_select_authorized"',
    );
    expect(scheduleCollaboration).toContain('create policy "schedule_date_notes_insert_admin"');
    expect(scheduleCollaboration).toContain('create policy "schedule_date_notes_update_admin"');
    expect(scheduleCollaboration).toContain('create policy "schedule_date_notes_delete_admin"');
    expect(scheduleCollaboration).toContain("grant select, insert, update, delete");
  });

  it("deixa o controlador somente com leitura das escalas", () => {
    expect(scheduleMutationPermissions).toContain(
      "create or replace function public.can_manage_schedules",
    );
    expect(scheduleMutationPermissions).toContain(
      "p.role in ('supervisor'::public.app_role, 'admin'::public.app_role)",
    );
    expect(scheduleMutationPermissions).toContain(
      "and (select public.can_manage_schedules((select auth.uid())))",
    );
    expect(scheduleMutationPermissions).toContain(
      "using ((select public.can_manage_schedules((select auth.uid()))))",
    );
    expect(scheduleMutationPermissions).toContain(
      'drop policy if exists "schedule_uploads_delete_authorized"',
    );
  });
});
