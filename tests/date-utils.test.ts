import { describe, expect, it } from "vitest";
import { addDays, formatShortDate, hhmm, isLate, weekdayOf } from "../src/lib/date-utils";

describe("datas da rotina", () => {
  it("calcula o dia da semana sem deslocamento de fuso", () => {
    expect(weekdayOf("2026-08-03")).toBe(1);
  });

  it("avança e retrocede datas", () => {
    expect(addDays("2026-08-03", 1)).toBe("2026-08-04");
    expect(addDays("2026-08-03", -1)).toBe("2026-08-02");
  });

  it("formata data e hora", () => {
    expect(formatShortDate("2026-08-03")).toBe("03/08/2026");
    expect(hhmm("17:30:00")).toBe("17:30");
  });

  it("não classifica datas anteriores ou futuras como atraso do dia", () => {
    expect(
      isLate({ scheduledDate: "2000-01-01", scheduledTime: "00:00:00", completed: false }),
    ).toBe(false);
    expect(
      isLate({ scheduledDate: "2099-01-01", scheduledTime: "00:00:00", completed: false }),
    ).toBe(false);
  });
});
