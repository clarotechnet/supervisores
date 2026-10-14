import assert from "node:assert/strict";

export async function verifyReferenceFilters(page, responsive = false) {
  const selectors = ["unitPicker", "monthPicker", "datePicker"];
  const menu = (id) => page.locator(`#${id} > .filter-popover`);
  const isOpen = (id) => page.locator(`#${id}`).evaluate((el) => el.open);
  const checkPosition = async (id) => {
    await menu(id).waitFor({ state: "visible" });
    const trigger = await page.locator(`#${id} > summary`).boundingBox();
    const toolbar = await page.locator(".reference-header").boundingBox();
    const box = await menu(id).boundingBox();
    const viewport = page.viewportSize();
    assert(
      box.x >= 7 && box.x + box.width <= viewport.width - 7,
      `${id}: horizontally inside viewport`,
    );
    assert(
      box.y >= 7 && box.y + box.height <= viewport.height - 7,
      `${id}: vertically inside viewport`,
    );
    assert(
      Math.abs(box.y - (Math.max(trigger.y + trigger.height, toolbar.y + toolbar.height) + 8)) <
        2 || Math.abs(box.y + box.height + 8 - toolbar.y) < 2,
      `${id}: anchored to its own summary`,
    );
  };
  for (const id of selectors) {
    await page.locator(`#${id} > summary`).click();
    await checkPosition(id);
    for (const other of selectors)
      if (other !== id)
        assert.equal(await isOpen(other), false, `${other} must close when ${id} opens`);
  }
  await page.keyboard.press("Escape");
  assert.equal(await isOpen("datePicker"), false);
  assert.equal(
    await page.locator("#datePicker > summary").evaluate((el) => el === document.activeElement),
    true,
  );
  for (const id of selectors) {
    await page.locator(`#${id} > summary`).click();
    await checkPosition(id);
    // The event may originate inside a chart's Shadow DOM, not the toolbar.
    await page.locator(".reference-workspace").click({ position: { x: 4, y: 4 } });
    assert.equal(await isOpen(id), false, `${id}: outside click must dismiss`);
  }
  await page.locator("#unitPicker > summary").click();
  const unitLabel = page.locator("#unitOptions label").filter({ hasText: "NTL-DMV_ADM" });
  await unitLabel.click({ position: { x: 100, y: 10 } });
  assert.equal(await page.locator('#unitOptions input[data-unit="NTL-DMV_ADM"]').isChecked(), true);
  assert.equal(await isOpen("unitPicker"), true, "Clicking the unit text keeps the menu open");
  await unitLabel.click({ position: { x: 100, y: 10 } });
  assert.equal(
    await page.locator('#unitOptions input[data-unit="NTL-DMV_ADM"]').isChecked(),
    false,
  );
  await page.locator('#unitOptions input[data-unit="NTL-DMV_ADM"]').check();
  assert.equal(await isOpen("unitPicker"), true, "Multi-select stays open while choosing");
  await page.locator("#unitOptions [data-adhesion-default]").click();
  await page.keyboard.press("Escape");
  await verifyMultiMonthLabels(page);
  await page.locator("#monthPicker > summary").click();
  await page
    .locator("#monthOptions label")
    .filter({ hasText: "Todos os meses" })
    .click({ position: { x: 100, y: 10 } });
  assert.equal(await isOpen("monthPicker"), true, "Clicking the month label keeps the menu open");
  await page.keyboard.press("Escape");
  await page.locator("#datePicker > summary").click();
  await page.locator("#periodStart").fill("2026-10-02");
  await page.locator("#periodEnd").fill("2026-10-01");
  await page.locator("#periodApply").click();
  assert.equal(await isOpen("datePicker"), true, "Invalid date range stays open for correction");
  assert.equal(
    await page.locator("#periodError").innerText(),
    "A data inicial não pode ser maior que a final.",
  );
  await page.locator("#periodClear").click();
  await page.locator("#periodStart").fill("2026-10-01");
  await page.locator("#periodEnd").fill("2026-10-02");
  await page.locator("#periodApply").click();
  assert.equal(await isOpen("datePicker"), false, "Apply closes the date filter");
  await page.locator("#datePicker > summary").click();
  await page.locator("#periodClear").click();
  await page.keyboard.press("Escape");
  if (responsive) {
    const previous = page.viewportSize();
    await page.locator("#unitPicker > summary").click();
    await page.setViewportSize({ width: 1366, height: 768 });
    await checkPosition("unitPicker");
    await page.screenshot({
      path: "C:/Users/Usuario/AppData/Local/Temp/quality-filter-fixed-unit.png",
    });
    await page.locator("#monthPicker > summary").click();
    await checkPosition("monthPicker");
    await page.locator("#datePicker > summary").click();
    await checkPosition("datePicker");
    await page.screenshot({
      path: "C:/Users/Usuario/AppData/Local/Temp/quality-filter-fixed-dates.png",
    });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 740 });
    for (const id of selectors) {
      await page.locator(`#${id} > summary`).click();
      await checkPosition(id);
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize(previous);
  }
  console.log(
    "Filter regression passed: anchors, exclusive opening, outside click, Escape, label text/checkbox selection and dates",
  );
}

async function verifyMultiMonthLabels(page) {
  // An isolated clone exercises the real toolbar/dismissal with several months,
  // without modifying the application's fixture data or any calculation engine.
  await page.evaluate(async () => {
    const { referenceFilters } = await import("/src/components/quality/reference-filters.ts");
    const root = document.createElement("div");
    root.id = "labelRegression";
    root.className = "quality-reference";
    root.tabIndex = -1;
    root.style.cssText =
      "position:fixed;inset:8px;z-index:10000;min-height:0;height:auto;background:white";
    const header = document.querySelector(".reference-header").cloneNode(true);
    for (const node of header.querySelectorAll("[id]")) node.id = "qaLabel_" + node.id;
    const months = ["2026-07", "2026-09", "2026-10"];
    let selected = ["2026-09", "2026-10"],
      changes = 0;
    const options = header.querySelector("#qaLabel_monthOptions");
    const render = () => {
      options.innerHTML =
        '<label><input type="checkbox" data-month="*" ' +
        (selected.length === months.length ? "checked" : "") +
        ">Todos os meses</label>" +
        months
          .map(
            (m) =>
              '<label><input type="checkbox" data-month="' +
              m +
              '" ' +
              (selected.includes(m) ? "checked" : "") +
              ">" +
              m.slice(5) +
              "/" +
              m.slice(0, 4) +
              "</label>",
          )
          .join("");
      root.dataset.selected = JSON.stringify(selected);
      root.dataset.changes = String(changes);
    };
    options.onchange = (event) => {
      const input = event.target;
      selected =
        input.dataset.month === "*"
          ? [...months]
          : input.checked
            ? [...selected, input.dataset.month]
            : selected.filter((m) => m !== input.dataset.month);
      changes++;
      // As in the real panel, refreshing the toolbar replaces its options.
      render();
    };
    render();
    root.append(header);
    document.body.append(root);
    const controller = referenceFilters(header);
    root.addEventListener(
      "qaDispose",
      () => {
        controller.dispose();
        root.remove();
      },
      { once: true },
    );
  });
  try {
    const selected = () =>
      page.locator("#labelRegression").evaluate((el) => JSON.parse(el.dataset.selected));
    const open = () => page.locator("#qaLabel_monthPicker").evaluate((el) => el.open);
    const label = (text) => page.locator("#qaLabel_monthOptions label").filter({ hasText: text });
    await page.locator("#qaLabel_monthPicker > summary").click();
    await label("09/2026").click({ position: { x: 100, y: 10 } });
    assert.deepEqual(await selected(), ["2026-10"], "Clicking the date text deselects that month");
    assert.equal(await open(), true);
    await label("07/2026").click({ position: { x: 100, y: 10 } });
    assert.deepEqual(
      await selected(),
      ["2026-10", "2026-07"],
      "Clicking an unchecked date selects it",
    );
    assert.equal(await open(), true);
    assert.equal(
      await page.locator("#labelRegression").getAttribute("data-changes"),
      "2",
      "One change per label click",
    );
    await label("Todos os meses").click({ position: { x: 100, y: 10 } });
    assert.deepEqual(await selected(), ["2026-07", "2026-09", "2026-10"]);
    assert.equal(await open(), true);
    await page.locator('#qaLabel_monthOptions input[data-month="2026-09"]').uncheck();
    assert.deepEqual(await selected(), ["2026-07", "2026-10"], "Checkbox clicks still work");
    assert.equal(await open(), true);
    await page.locator('#qaLabel_monthOptions input[data-month="2026-09"]').focus();
    await page.keyboard.press("Space");
    assert.deepEqual(
      await selected(),
      ["2026-07", "2026-10", "2026-09"],
      "Keyboard activation works too",
    );
    assert.equal(await open(), true);
    await page.locator("#qaLabel_goQQ").focus();
    assert.equal(await open(), false, "Keyboard focus on an outside control still dismisses");
    await page.locator("#qaLabel_monthPicker > summary").click();
    await page.keyboard.press("Escape");
    assert.equal(await open(), false);
  } finally {
    await page.locator("#labelRegression").dispatchEvent("qaDispose");
  }
}
