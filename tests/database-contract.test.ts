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
});
