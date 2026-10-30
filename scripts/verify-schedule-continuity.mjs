// Local browser QA only. All non-loopback HTTP/WebSocket traffic is intercepted.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  "C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/",
);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [],
  calls = [];
let failDelete = true;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.routeWebSocket("**/*", (s) => s.close());
  await page.route("**/*", (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (!url.hostname.endsWith(".supabase.co")) return route.abort();
    const table = url.pathname.split("/").at(-1);
    let body = {};
    if (table === "schedule_uploads")
      body = {
        id: "official",
        source_file: "Google Sheets - Escala operacional oficial",
        source_sheet: "Controle JANEIRO 27 - 5X2",
      };
    if (table === "schedule_generation_drafts")
      body = { id: "v4", policy_snapshot: { published: true, officialScheduleId: "official" } };
    if (table === "schedule_operational_sheets")
      body = {
        id: "op",
        draft_id: "v4",
        city: "natal",
        sector: "controle-operacional",
        schedule_month: "2027-01-01",
        sheet_tab: "Controle JANEIRO 27 - 5X2",
        updated_at: "fresh",
      };
    if (table === "schedule-operational") {
      const input = req.postDataJSON();
      calls.push(input);
      if (input.action === "inspect_delete")
        body = {
          ok: true,
          gridId: 100,
          confirmation: "EXCLUIR 2027-01 ABA 100",
          expectedUpdatedAt: "fresh",
          linkChanged: true,
          warning: "O vínculo salvo aponta para outra aba. A aba anterior será preservada.",
        };
      else if (input.action === "delete")
        return route.fulfill({
          status: failDelete ? 409 : 200,
          contentType: "application/json",
          body: JSON.stringify(
            failDelete
              ? {
                  code: "SHEET_LINK_CHANGED",
                  error: "O vínculo mudou. Reabra a confirmação de exclusão e confira a aba atual.",
                }
              : { ok: true, deleted: true },
          ),
        });
      else throw Error("Unexpected mutation: " + input.action);
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/continuity-qa", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><div id="root"></div><div id="router"></div></body></html>',
    }),
  );
  await page.goto("http://127.0.0.1:5175/continuity-qa");
  await page.evaluate(async () => {
    const { default: runtime } = await import("/@react-refresh");
    runtime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  });
  const generated = await page.evaluate(async () => {
    const { generateSchedulePreview } = await import("/src/lib/schedule-generator.ts");
    const { scheduleMonthDates } = await import("/src/lib/schedule-view.ts");
    const dates = [
      ...scheduleMonthDates("2026-12"),
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
      "2027-01-04",
    ];
    const source = {
      id: "qa",
      city: "natal",
      sector: "controle-operacional",
      schedule_month: "2026-12-01",
      source_sheet: "Source QA",
      payload: {
        dates,
        codes: ["Folga", "T. 1"],
        people: ["Pessoa A", "Pessoa B"].map((name) => ({
          name,
          jobTitle: "CONTROLADOR",
          assignments: Object.fromEntries(
            dates.map((d) => [
              d,
              [0, 1].includes(new Date(d + "T12:00:00Z").getUTCDay()) ? "Folga" : "T. 1",
            ]),
          ),
        })),
      },
    };
    source.payload.people[0].assignments["2027-01-04"] = "AT";
    const p = generateSchedulePreview(source, "2027-01");
    if (p.payload.people[0].assignments["2027-01-04"] !== "AT") throw Error("Inherited AT changed");
    const { editControlPreviewCode } = await import("/src/lib/schedule-preview-editor.ts");
    let blocked = false;
    try {
      editControlPreviewCode(p, 0, "2027-01-04", "Folga");
    } catch {
      blocked = true;
    }
    return {
      blocked,
      last: p.calendarWeeks.at(-1).at(-1),
      next: p.payload.people[1].assignments["2027-01-05"],
    };
  });
  assert.deepEqual(generated, { blocked: true, last: "2027-02-06", next: "T. 1" });
  await page.evaluate(async () => {
    const { default: React } = await import("/node_modules/.vite/deps/react.js");
    const {
      default: { createRoot },
    } = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { ScheduleMonthDeleteDialog } =
      await import("/src/components/ScheduleMonthDeleteDialog.tsx");
    await import("/src/styles.css");
    window.qaRoot = createRoot(document.getElementById("root"));
    window.qaRoot.render(
      React.createElement(ScheduleMonthDeleteDialog, {
        open: true,
        onOpenChange() {},
        schedule: {
          id: "official",
          city: "natal",
          sector: "controle-operacional",
          schedule_month: "2027-01-01",
        },
        onDeleted: async () => {
          window.deleted = true;
        },
      }),
    );
  });
  const input = page.getByLabel("Digite EXCLUIR 2027-01 ABA 100 para confirmar");
  await input.waitFor();
  const button = page.getByRole("button", { name: "Excluir escala e aba", exact: true });
  await input.fill("EXCLUIR 2027-01");
  assert.equal(await button.isDisabled(), true);
  assert.equal(calls.filter((c) => c.action === "delete").length, 0);
  await input.fill("EXCLUIR 2027-01 ABA 100");
  await button.click();
  await page.getByRole("alert").filter({ hasText: "O vínculo mudou" }).waitFor();
  assert.deepEqual(calls.at(-1), {
    action: "delete",
    sheetId: "op",
    scheduleId: "official",
    confirmation: "EXCLUIR 2027-01 ABA 100",
    confirmedGridId: 100,
    expectedUpdatedAt: "fresh",
  });
  const screenshot = join(tmpdir(), "schedule-delete-confirmed-gid.png");
  await page.screenshot({ path: screenshot });
  failDelete = false;
  await button.click();
  await page.waitForFunction(() => window.deleted === true);
  // Exercise real Links with the app's configuration, independent from HTTP 409.
  await page.evaluate(async () => {
    window.qaRoot.unmount();
    const { default: React } = await import("/node_modules/.vite/deps/react.js");
    const {
      default: { createRoot },
    } = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { getRouter } = await import("/src/router.tsx");
    const {
      createRouter,
      createRootRoute,
      createRoute,
      createMemoryHistory,
      RouterProvider,
      Link,
      Outlet,
    } = await import("/node_modules/.vite/deps/@tanstack_react-router.js");
    const policy = getRouter().options.defaultPreload;
    if (policy !== false) throw Error("Unsafe intent preloading enabled");
    window.loaderCalls = 0;
    const root = createRootRoute({
      component: () =>
        React.createElement(
          "div",
          null,
          React.createElement(Link, { to: "/slow" }, "Slow QA"),
          " · ",
          React.createElement(Link, { to: "/" }, "Home QA"),
          React.createElement(Outlet),
        ),
    });
    const home = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => React.createElement("p", null, "At home"),
    });
    const slow = createRoute({
      getParentRoute: () => root,
      path: "/slow",
      loader: async () => {
        window.loaderCalls++;
        await new Promise((r) => setTimeout(r, 50));
      },
      component: () => React.createElement("p", null, "Slow loaded"),
    });
    const router = createRouter({
      routeTree: root.addChildren([home, slow]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      defaultPreload: policy,
    });
    createRoot(document.getElementById("router")).render(
      React.createElement(RouterProvider, { router }),
    );
  });
  await page.getByText("At home", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Slow QA" }).hover();
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.loaderCalls), 0);
  for (let i = 0; i < 6; i++) {
    await page.getByRole("link", { name: "Slow QA" }).click();
    await page.getByText("Slow loaded", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Home QA" }).click();
    await page.getByText("At home", { exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      inheritedLocked: true,
      closesFeb6: true,
      correctGidConfirmation: true,
      http409BodyVisible: true,
      hoverDoesNotPreload: true,
      navigationWorks: true,
      productionWrites: 0,
      screenshot,
    }),
  );
} finally {
  await browser.close();
}
