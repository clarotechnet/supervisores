// Full UI regression with synthetic accounts. Every remote read/write is intercepted.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const actor = "00000000-0000-0000-0000-000000000001";
const supervisor = "00000000-0000-0000-0000-000000000002";
const otherSupervisor = "00000000-0000-0000-0000-000000000003";
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:5175";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [],
  writes = [],
  screenshots = [];

async function createPage(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const data = {
    role,
    failRead: false,
    overdue:
      role === "admin"
        ? Array.from({ length: 9 }, (_, index) => ({
            id: `task-${index}`,
            user_id: index < 3 ? supervisor : otherSupervisor,
            supervisor_name: "Nome histórico",
            title: `Conferir atividade de exemplo ${index + 1}`,
            scheduled_time: `08:${String(index * 5).padStart(2, "0")}:00`,
          }))
        : [],
    notifications:
      role === "supervisor"
        ? [
            {
              id: "n1",
              recipient_id: actor,
              type: "task_assigned",
              title: "Nova tarefa delegada",
              message: "Conferir os indicadores",
              entity_id: null,
              metadata: { scheduled_date: "2026-10-23", due_time: "14:00:00" },
              read_at: null,
              created_at: "2026-10-23T10:00:00Z",
            },
            {
              id: "n2",
              recipient_id: actor,
              type: "task_note_mention",
              title: "Você foi marcado em uma observação",
              message: "Observação completa para conferência.\nNão perder a segunda linha.",
              entity_id: null,
              metadata: { task_title: "Conferir rota do dia" },
              read_at: null,
              created_at: "2026-10-23T11:00:00Z",
            },
          ]
        : [],
    messages:
      role === "controller"
        ? []
        : [
            {
              id: "m1",
              supervisor_id: role === "supervisor" ? actor : supervisor,
              manager_id: role === "admin" ? actor : otherSupervisor,
              sender_id: role === "supervisor" ? otherSupervisor : supervisor,
              sender_role: role === "supervisor" ? "admin" : "supervisor",
              body: "Mensagem de exemplo sem abrir aviso automaticamente.",
              read_at: null,
              created_at: "2026-10-23T12:00:00Z",
            },
          ],
    requests: [],
  };
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.addInitScript(
    ({ actor }) => {
      const now = Math.floor(Date.now() / 1000);
      const user = {
        id: actor,
        email: "qa@example.invalid",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      };
      const jwt = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: actor, aud: "authenticated", role: "authenticated", exp: now + 3600 }))}.mock`;
      localStorage.setItem(
        "sb-rwstmomeldwrjmczrmnp-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "mock",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          user,
        }),
      );
      localStorage.setItem("technet-color-theme", "light");
    },
    { actor },
  );
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) return route.abort();
    const table = url.pathname.split("/").at(-1);
    data.requests.push({ table, method: request.method() });
    let result = [],
      status = 200;
    const profile = (id) => ({
      id,
      role: id === actor ? data.role : "supervisor",
      status: "active",
      full_name:
        id === actor
          ? "QA Administrador de exemplo"
          : id === supervisor
            ? "Ana Supervisora"
            : "Bruno Supervisor",
      email: "qa@example.invalid",
      sector_id: null,
      sectors: null,
    });
    if (table === "profiles")
      result = url.searchParams.has("id")
        ? profile(url.searchParams.get("id").slice(3))
        : [profile(supervisor), profile(otherSupervisor)];
    if (table === "daily_task_records")
      result = url.searchParams.has("user_id") ? [] : data.overdue;
    if (table === "notifications" || table === "conversation_messages") {
      const rows = table === "notifications" ? data.notifications : data.messages;
      if (request.method() === "PATCH") {
        const body = request.postDataJSON();
        const id = url.searchParams.get("id")?.slice(3);
        writes.push({ role, table, id, body });
        if (data.failRead) {
          status = 500;
          result = { message: "Falha simulada" };
        } else {
          for (const row of rows) if (!id || row.id === id) row.read_at = body.read_at;
          result = null;
        }
      } else result = rows.filter((row) => !url.searchParams.has("read_at") || !row.read_at);
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.goto(`${baseUrl}/${role === "controller" ? "escalas" : "perfil"}`);
  await page.getByRole("button", { name: /^Notificações/ }).waitFor();
  return { page, data, context };
}

const bell = (page) => page.getByRole("button", { name: /^Notificações/ });
const panel = (page) => page.getByRole("dialog", { name: "Notificações", exact: true });
async function count(page, expected) {
  await page.waitForFunction((expected) => {
    const button = document.querySelector('button[title="Notificações"]');
    return (
      button?.getAttribute("aria-label") ===
      (expected
        ? `Notificações, ${expected} ${expected === 1 ? "pendente" : "pendentes"}`
        : "Notificações")
    );
  }, expected);
}
async function realtime(page, topic, table, eventType, next, old = {}) {
  const called = await page.evaluate(
    async ({ topic, table, eventType, next, old }) => {
      const { supabase } = await import("/src/integrations/supabase/client.ts");
      let called = 0;
      for (const channel of supabase.getChannels()) {
        if (!channel.topic.includes(topic)) continue;
        for (const binding of channel.bindings.postgres_changes || []) {
          if (binding.filter.table !== table) continue;
          binding.callback({ eventType, new: next, old, schema: "public", table });
          called++;
        }
      }
      return called;
    },
    { topic, table, eventType, next, old },
  );
  assert.ok(called > 0, `Missing live handler: ${topic}/${table}`);
}

try {
  const admin = await createPage("admin");
  const { page, data } = admin;
  await count(page, 3);
  assert.equal(await page.locator("[data-sonner-toast]").count(), 0);
  assert.equal(await page.getByText("Ana Supervisora está com 3 atividades atrasadas").count(), 0);
  const positions = await page.locator('button[title="Notificações"]').evaluate((button) => ({
    bell: button.getBoundingClientRect().right,
    theme: button.nextElementSibling.getBoundingClientRect().left,
  }));
  assert.ok(positions.theme >= positions.bell && positions.theme - positions.bell < 16);
  await bell(page).click();
  await panel(page).getByText("Ana Supervisora está com 3 atividades atrasadas").waitFor();
  assert.equal(await panel(page).locator("article").count(), 3);
  assert.match(await panel(page).innerText(), /Bruno Supervisor está com 6 atividades atrasadas/);
  await page.keyboard.press("Escape");
  await panel(page).waitFor({ state: "hidden" });
  await bell(page).click();
  await page
    .getByRole("heading", { name: "Meu perfil", exact: true })
    .click({ position: { x: 10, y: 10 } });
  await panel(page).waitFor({ state: "hidden" });
  assert.equal(writes.length, 0, "Opening or closing the panel must not mark anything as read");

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["dark", "light"]) {
      const toggle = page.getByRole("button", {
        name: theme === "dark" ? "Ativar tema escuro" : "Ativar tema claro",
      });
      await toggle.click();
      await bell(page).click();
      const bounds = await panel(page).boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      const file = join(tmpdir(), `notification-center-${width}-${theme}.png`);
      await page.screenshot({ path: file, animations: "disabled" });
      screenshots.push(file);
      await page.keyboard.press("Escape");
      await panel(page).waitFor({ state: "hidden" });
    }
  }
  await page.setViewportSize({ width: 1440, height: 950 });
  await bell(page).click();
  await panel(page)
    .getByRole("button", { name: /^Dispensar: Ana/ })
    .click();
  await count(page, 2);
  await realtime(page, "manager-overdue-notifications", "daily_task_records", "UPDATE", {});
  await count(page, 2);
  data.overdue.push({ ...data.overdue[0], id: "task-new" });
  await realtime(page, "manager-overdue-notifications", "daily_task_records", "INSERT", {});
  await count(page, 3);
  await panel(page).getByText("Ana Supervisora está com 4 atividades atrasadas").waitFor();
  data.overdue = data.overdue.filter((task) => task.user_id !== otherSupervisor);
  await realtime(page, "manager-overdue-notifications", "daily_task_records", "UPDATE", {});
  await count(page, 2);
  data.failRead = true;
  await panel(page).getByRole("button", { name: "Abrir conversa" }).click();
  await panel(page).getByRole("alert").waitFor();
  await count(page, 2);
  assert.equal(await page.locator("[data-sonner-toast]").count(), 0);
  data.failRead = false;
  await panel(page).getByRole("button", { name: "Abrir conversa" }).click();
  await page.waitForURL(`**/admin/supervisor/${supervisor}`);
  await page.getByRole("heading", { name: "Ana Supervisora", exact: true }).waitFor();
  await count(page, 1);
  await bell(page).click();
  await panel(page).getByRole("button", { name: "Ver supervisor" }).click();
  await count(page, 0);
  await bell(page).click();
  await panel(page).getByText("Nenhuma notificação pendente.").waitFor();

  const sup = await createPage("supervisor");
  await count(sup.page, 3);
  assert.equal(await sup.page.locator("[data-sonner-toast]").count(), 0);
  await bell(sup.page).click();
  await panel(sup.page).getByRole("button", { name: "Abrir observação" }).click();
  const mention = sup.page.getByRole("dialog", { name: "Observação marcada para você" });
  await mention.waitFor();
  assert.match(await mention.innerText(), /Conferir rota do dia/);
  assert.match(await mention.innerText(), /Não perder a segunda linha/);
  await mention.getByRole("button", { name: "Fechar", exact: true }).click();
  await count(sup.page, 2);
  const insert = {
    ...sup.data.notifications[0],
    id: "n3",
    title: "Nova notificação em tempo real",
  };
  await realtime(sup.page, "user-notifications", "notifications", "INSERT", insert);
  await realtime(sup.page, "user-notifications", "notifications", "INSERT", insert);
  await count(sup.page, 3);
  await realtime(sup.page, "user-notifications", "notifications", "INSERT", {
    ...insert,
    id: "private",
    recipient_id: supervisor,
  });
  await count(sup.page, 3);
  await realtime(sup.page, "user-notifications", "notifications", "UPDATE", {
    ...insert,
    read_at: new Date().toISOString(),
  });
  await count(sup.page, 2);
  await realtime(sup.page, "user-notifications", "notifications", "INSERT", insert);
  await count(sup.page, 2);
  await realtime(sup.page, "conversation-notifications", "conversation_messages", "UPDATE", {
    ...sup.data.messages[0],
    read_at: new Date().toISOString(),
  });
  await count(sup.page, 1);
  await bell(sup.page).click();
  await panel(sup.page).getByRole("button", { name: "Ver tarefas" }).click();
  await sup.page.waitForURL("**/tarefas");
  await sup.page.getByRole("heading", { name: "Minhas tarefas", exact: true }).waitFor();
  await count(sup.page, 0);
  await bell(sup.page).click();
  await panel(sup.page).getByText("Nenhuma notificação pendente.").waitFor();
  assert.equal(
    sup.data.requests.some((request) => request.table === "daily_task_records"),
    false,
  );

  const controller = await createPage("controller");
  await count(controller.page, 0);
  assert.equal(
    controller.data.requests.some((request) =>
      ["notifications", "conversation_messages", "daily_task_records"].includes(request.table),
    ),
    false,
  );
  assert.equal(await controller.page.locator("[data-sonner-toast]").count(), 0);
  assert.deepEqual(errors, []);
  assert.ok(
    writes.every(
      (write) =>
        ["notifications", "conversation_messages"].includes(write.table) &&
        Object.keys(write.body).join() === "read_at",
    ),
  );
  console.log(
    JSON.stringify({
      quietHeaderBell: true,
      besideTheme: true,
      outsideClickAndEscape: true,
      darkLightAndMobile: true,
      overdueLiveUpdates: true,
      mentionsAndTaskNavigation: true,
      readFailurePreservesAlert: true,
      realtimeDeduplicated: true,
      readUpdatesSynced: true,
      roleBoundaries: true,
      productionWrites: 0,
      screenshots,
    }),
  );
} finally {
  await browser.close();
}
