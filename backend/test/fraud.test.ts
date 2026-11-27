import { describe, expect, it } from "vitest";
import { bandFor, evaluateBatch, maxTransfersInWindow } from "../src/services/fraud.js";

const NOW = new Date("2026-10-10T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const future = new Date("2027-10-10T00:00:00Z");

const base = { status: "certified" as const, certExpiry: future, transferTimes: [], chainMismatch: false, now: NOW };
const ids = (r: ReturnType<typeof evaluateBatch>) => r.rules.map((x) => x.rule);

describe("evaluateBatch", () => {
  it("scores a clean certified batch 100 / verified", () => {
    const r = evaluateBatch(base);
    expect(r).toEqual({ score: 100, band: "verified", rules: [] });
  });

  it("R1: uncertified batch loses 40 (caution)", () => {
    const r = evaluateBatch({ ...base, status: "registered", certExpiry: null });
    expect(ids(r)).toEqual(["R1"]);
    expect(r.score).toBe(60);
    expect(r.band).toBe("caution");
  });

  it("R5: rejected batch loses 60 and does not also trigger R1", () => {
    const r = evaluateBatch({ ...base, status: "rejected", certExpiry: null });
    expect(ids(r)).toEqual(["R5"]);
    expect(r.score).toBe(40);
    expect(r.band).toBe("suspicious");
  });

  it("R2: chain mismatch loses 30 and carries the differences", () => {
    const r = evaluateBatch({ ...base, chainMismatch: true, chainMismatchDetails: ["hand-over 1 differs"] });
    expect(ids(r)).toEqual(["R2"]);
    expect(r.score).toBe(70);
    expect(r.rules[0].details).toBe("hand-over 1 differs");
  });

  it("R2 is skipped when the chain could not be checked", () => {
    expect(ids(evaluateBatch({ ...base, chainMismatch: null }))).toEqual([]);
  });

  it("R3: expired certificate loses 25", () => {
    const r = evaluateBatch({ ...base, certExpiry: minutesAgo(1) });
    expect(ids(r)).toEqual(["R3"]);
    expect(r.score).toBe(75);
    expect(r.rules[0].details).toContain("2026-10-10");
  });

  it("R3 only applies to certified batches", () => {
    const r = evaluateBatch({ ...base, status: "rejected", certExpiry: minutesAgo(1) });
    expect(ids(r)).toEqual(["R5"]);
  });

  it("R4: 3 transfers in an hour is fine, 4 loses 10, 6+ is capped at 20", () => {
    const times = (n: number) => Array.from({ length: n }, (_, i) => minutesAgo(i * 10));
    expect(ids(evaluateBatch({ ...base, transferTimes: times(3) }))).toEqual([]);
    expect(evaluateBatch({ ...base, transferTimes: times(4) }).rules[0]).toMatchObject({ rule: "R4", impact: 10, severity: "medium" });
    expect(evaluateBatch({ ...base, transferTimes: times(5) }).rules[0].impact).toBe(20);
    expect(evaluateBatch({ ...base, transferTimes: times(6) }).rules[0].impact).toBe(20);
  });

  it("R4 ignores transfers spread over more than an hour", () => {
    const spread = [minutesAgo(0), minutesAgo(50), minutesAgo(100), minutesAgo(150)];
    expect(ids(evaluateBatch({ ...base, transferTimes: spread }))).toEqual([]);
  });

  it("combines rules and clamps the score at 0", () => {
    const r = evaluateBatch({
      ...base,
      status: "rejected",
      chainMismatch: true,
      transferTimes: Array.from({ length: 6 }, (_, i) => minutesAgo(i)),
    });
    expect(ids(r)).toEqual(["R5", "R2", "R4"]);
    expect(r.score).toBe(0);
    expect(r.band).toBe("suspicious");
  });
});

describe("helpers", () => {
  it("maxTransfersInWindow uses a sliding window", () => {
    expect(maxTransfersInWindow([])).toBe(0);
    expect(maxTransfersInWindow([minutesAgo(0), minutesAgo(30), minutesAgo(65), minutesAgo(100)])).toBe(2);
    expect(maxTransfersInWindow([minutesAgo(0), minutesAgo(30), minutesAgo(61), minutesAgo(90)])).toBe(3);
    expect(maxTransfersInWindow([minutesAgo(0), minutesAgo(60)])).toBe(2); // inclusive at exactly 1 hour
  });

  it("bandFor matches the TRD thresholds", () => {
    expect([100, 80, 79, 50, 49, 0].map(bandFor)).toEqual(["verified", "verified", "caution", "caution", "suspicious", "suspicious"]);
  });
});
