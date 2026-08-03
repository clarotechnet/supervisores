import { describe, expect, it, vi } from "vitest";
import { cacheChecklistRecords, getCachedChecklistRecords } from "../src/lib/checklist-cache";
import type { TaskRecord } from "../src/lib/types";

function record(id: string): TaskRecord {
  return {
    id,
    checklist_id: "checklist-1",
    task_template_id: null,
    assigned_task_id: null,
    user_id: "user-1",
    supervisor_name: "Supervisor",
    sector_id: "sector-1",
    title: "Atividade",
    group_name: "Grupo",
    scheduled_date: "2026-08-03",
    scheduled_time: "08:00:00",
    status: "pending",
    completed_at: null,
    note: null,
    updated_at: "2026-08-03T08:00:00Z",
  };
}

describe("cache do checklist", () => {
  it("reaproveita os dados sem compartilhar objetos mutáveis", () => {
    const params = { userId: "cache-user", sectorId: "cache-sector", dateKey: "2026-08-03" };
    cacheChecklistRecords(params, [record("record-1")]);

    const cached = getCachedChecklistRecords(params);
    expect(cached).toHaveLength(1);
    cached![0].title = "Alterada localmente";
    expect(getCachedChecklistRecords(params)?.[0].title).toBe("Atividade");
  });

  it("descarta entradas antigas", () => {
    const now = vi.spyOn(Date, "now");
    const params = { userId: "expired-user", sectorId: "sector", dateKey: "2026-08-03" };
    now.mockReturnValue(1_000);
    cacheChecklistRecords(params, [record("record-2")]);
    now.mockReturnValue(1_000 + 5 * 60 * 1000 + 1);

    expect(getCachedChecklistRecords(params)).toBeNull();
    now.mockRestore();
  });
});
