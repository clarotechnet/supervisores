import { describe, expect, it } from "vitest";
import { readQualityPages } from "../src/lib/quality-loading";

describe("quality page loading", () => {
  it("bounds concurrency and preserves record/page order", async () => {
    let active = 0,
      maximum = 0;
    const result = await readQualityPages(13, async (page) => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, (4 - (page % 4)) * 2));
      active--;
      return [page * 250, page * 250 + 249];
    });
    expect(maximum).toBe(4);
    expect(result).toEqual(Array.from({ length: 13 }, (_, page) => [page * 250, page * 250 + 249]));
  });
  it("does not start any request after cancellation", async () => {
    const controller = new AbortController();
    let started = 0;
    controller.abort();
    await expect(readQualityPages(10, async () => ++started, controller.signal)).rejects.toThrow();
    expect(started).toBe(0);
  });
  it("fails rather than returning an incomplete result", async () => {
    await expect(
      readQualityPages(8, async (page) => {
        if (page === 2) throw Error("missing page");
        return page;
      }),
    ).rejects.toThrow("missing page");
  });
  it("handles an empty manifest without reading pages", async () => {
    expect(
      await readQualityPages(0, async () => {
        throw Error("unexpected request");
      }),
    ).toEqual([]);
  });
});
