// Compare the port against the actual supplied frame, not a redesigned mockup.
// Only synthetic rows execute in this isolated, network-blocked browser page.
import fs from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";
const decode = (s) =>
  s.replace(
    /&(?:quot|#x27|#39|lt|gt|amp);/g,
    (e) =>
      ({ "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" })[e],
  );
const seedNames = new Set([
  "NAME_MAP",
  "TECH_MAP",
  "SUPERVISOR_MAP",
  "QQ_SOURCE_UPDATES",
  "QQ_INITIAL_GZIP",
  "QQ_SEPTEMBER_AUDIT_B64",
  "QQ_NAME_UPDATES",
  "SV_NAME_CORRECTIONS",
  "TC_NAME_UPDATES",
  "EMBEDDED_CSV_GZIP",
]);
export async function referenceParity(browser, page, kind, mode, rows) {
  const path =
    process.env.QUALITY_REFERENCE_HTML ||
    "C:/Users/Usuario/Downloads/DASH-QQ-TC-VRSJVNF3-120113102026.html";
  const html = fs.readFileSync(path, "utf8");
  const frame = decode(
    html.match(
      new RegExp(`<iframe id="frame${kind.toUpperCase()}"[^>]*srcdoc="([\\s\\S]*?)"[^>]*>`),
    )[1],
  );
  let code = [...frame.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .slice(kind === "qq" ? 1 : 0)
    .map((m) => m[1])
    .join("\n");
  const ast = ts.createSourceFile(
      "reference.js",
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    ),
    edits = [];
  for (const n of ast.statements) {
    if (ts.isVariableStatement(n))
      for (const d of n.declarationList.declarations)
        if (seedNames.has(d.name.getText(ast)))
          edits.push([
            d.initializer.getStart(ast),
            d.initializer.end,
            /GZIP|B64/.test(d.name.getText(ast))
              ? '""'
              : d.name.getText(ast) === "QQ_SOURCE_UPDATES"
                ? "[]"
                : "{}",
          ]);
    if (
      ts.isExpressionStatement(n) &&
      n.getText(ast).startsWith("(async") &&
      /QQ_INITIAL_GZIP|embeddedText\(\)/.test(n.getText(ast))
    )
      edits.push([n.getStart(ast), n.end, ""]);
  }
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
    code = code.slice(0, start) + replacement + code.slice(end);
  assert(!/[A-Za-z0-9+/]{5000}/.test(code), "Private source seeds were not removed");
  const host = page.locator(kind === "qq" ? "#referenceQQ" : "#referenceTC"),
    bounds = await host.boundingBox();
  const reference = await browser.newPage({
      viewport: { width: Math.round(bounds.width), height: Math.round(bounds.height) },
    }),
    errors = [];
  reference.on("pageerror", (e) => errors.push(e.message));
  await reference.route("**/*", (route) => route.abort());
  try {
    await reference.setContent(frame.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ""));
    await reference.evaluate(() => {
      document.body.classList.add("unified-embed");
      window.getSupervisorMap = () => ({});
      window.refreshUnifiedMonth = () => {};
    });
    await reference.addScriptTag({ content: code });
    await reference.evaluate(
      ({ kind, mode, rows }) => {
        if (kind === "qq") {
          // These are the source's own lexical variables/functions, in a QA page.
          RECS = rows;
          window.qqDataReady = true;
          init(true);
          window.setUnifiedUnits(
            window.getUnifiedUnits().units.filter((u) => /^[A-Z]{3}-DMV(?:_\d+)?$/.test(u)),
          );
          window.setUnifiedQQView(mode === "general" ? "general" : "front");
        } else {
          state.rows = rows;
          for (const r of rows) TECH_MAP[r.login] = { name: r.name, company: r.company };
          state.ready = true;
          applyMaps();
          initFilters(true);
          setLoading(false);
          render();
        }
      },
      { kind, mode, rows },
    );
    await reference.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    // In addition to screenshots, compare original SVG content and key layout
    // measurements relative to each frame. Small font rounding is tolerated.
    const selectors =
      kind === "tc"
        ? ["#presentationCityStrip", ".hero", "#panelView", "thead", "tbody"]
        : mode === "general"
          ? [".gg-toolbar", ".gg-chart", ".gg-summary-daily", ".gg-summary-monthly"]
          : ["#side", ".kpis", "#tabs", ".card"];
    const measure = (root, selectors, origin) =>
      Object.fromEntries(
        selectors.map((s) => {
          const el = root.querySelector(s);
          if (!el) return [s, null];
          const box = el.getBoundingClientRect(),
            css = getComputedStyle(el);
          return [
            s,
            {
              x: box.x - origin.x,
              y: box.y - origin.y,
              width: box.width,
              height: box.height,
              font: css.fontFamily,
              size: css.fontSize,
              background: css.backgroundColor,
              border: css.borderRadius,
            },
          ];
        }),
      );
    const actual = await host.evaluate(
      (host, { selectors, source }) =>
        Function(
          "root",
          "selectors",
          "origin",
          "return (" + source + ")(root,selectors,origin)",
        )(host.shadowRoot, selectors, host.getBoundingClientRect()),
      { selectors, source: measure.toString() },
    );
    const expected = await reference.evaluate(
      ({ selectors, source }) =>
        Function(
          "root",
          "selectors",
          "origin",
          "return (" + source + ")(root,selectors,origin)",
        )(document, selectors, { x: 0, y: 0 }),
      { selectors, source: measure.toString() },
    );
    for (const s of selectors) {
      assert.equal(!!actual[s], !!expected[s], `${mode}: ${s} structure`);
      if (!actual[s]) continue;
      // The old destructive "clear loaded base" control is intentionally
      // omitted; the system preserves published history and uses safe upserts.
      for (const k of ["x", "y", "width", "height"])
        if (!(s === "#side" && k === "height"))
          assert(
            Math.abs(actual[s][k] - expected[s][k]) < 2,
            `${mode}: ${s}.${k}: ${actual[s][k]} vs ${expected[s][k]}`,
          );
      for (const k of ["font", "size", "background", "border"])
        assert.equal(
          k === "font" ? actual[s][k].replace('"Quality Reference Inter"', "Inter") : actual[s][k],
          expected[s][k],
          `${mode}: ${s}.${k}`,
        );
    }
    const originalSVG = await reference
      .locator("svg")
      .evaluateAll((els) => els.map((e) => e.outerHTML));
    const nativeSVG = await host.locator("svg").evaluateAll((els) =>
      els.map((e) => {
        const visual = e.cloneNode(true);
        // The authorized change adds invisible click targets and accessible groups,
        // not a redesigned chart. Compare every original visible mark exactly.
        for (const point of visual.querySelectorAll(".qq-front-bar")) {
          point.querySelector(":scope > .qq-front-hit")?.remove();
          point.querySelector(":scope > title")?.remove();
          point.replaceWith(...point.childNodes);
        }
        return visual.outerHTML;
      }),
    );
    assert.deepEqual(nativeSVG, originalSVG, `${mode}: original SVG renderer`);
    assert.deepEqual(errors, []);
    await reference.screenshot({ path: `C:/Users/Usuario/AppData/Local/Temp/source-${mode}.png` });
    console.log(`Visual parity passed: ${mode}`);
  } finally {
    await reference.close();
  }
}
