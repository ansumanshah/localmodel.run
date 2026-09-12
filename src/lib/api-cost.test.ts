import { describe, expect, test } from "bun:test";
import { estimateApiCost, formatApiCost, type ApiPricing } from "./api-cost";

// A synthetic tariff makes the arithmetic independent of vendor price changes.
const tariff: ApiPricing = {
  inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: 0.2,
  sourceUrl: "https://example.com/prices", verifiedAt: "2026-09-12", validThrough: null, notes: "Test tariff",
};

describe("standard API token cost", () => {
  test("stops estimating when a known introductory tariff expires", () => {
    const introductory = { ...tariff, validThrough: "2026-12-31" };
    expect(estimateApiCost(introductory, 1, 0.2, 0, new Date("2026-12-31T23:59:59Z"))).toBe(4);
    expect(estimateApiCost(introductory, 1, 0.2, 0, new Date("2027-01-01T00:00:00Z"))).toBeNull();
  });
  test("distinguishes missing, zero and very small nonzero charges", () => {
    expect(formatApiCost(null)).toBe("Unavailable");
    expect(formatApiCost(0)).toBe("$0.00");
    expect(formatApiCost(0.00001)).toBe("<$0.001");
    expect(formatApiCost(1.5)).toBe("$1.50");
  });
  test("charges input and billed output separately, including fractional millions", () => {
    expect(estimateApiCost(tariff, 1.5, 0.25)).toBe(5.5);
    expect(estimateApiCost(tariff, 0, 0)).toBe(0);
    expect(estimateApiCost(tariff, 0, 0.2)).toBe(2);
  });
  test("does not turn unavailable prices into a zero-dollar estimate", () => {
    expect(estimateApiCost(null, 1, 1)).toBeNull();
  });
  test("cache reads replace only their input portion", () => {
    expect(estimateApiCost(tariff, 1, 0.2, 50)).toBeCloseTo(3.1);
    expect(estimateApiCost(tariff, 1, 0.2, 100)).toBeCloseTo(2.2);
  });
  test("unknown cache tariffs are safe for uncached or zero-input work only", () => {
    const unknownCache = { ...tariff, cacheReadPerMillion: null };
    expect(estimateApiCost(unknownCache, 1, 0.2)).toBe(4);
    expect(estimateApiCost(unknownCache, 1, 0.2, 50)).toBeNull();
    expect(estimateApiCost(unknownCache, 0, 0.2, 50)).toBe(2);
  });
  test("rejects negative, non-finite and overflowing inputs", () => {
    for (const invalid of [-1, NaN, Infinity, -Infinity]) {
      expect(estimateApiCost(tariff, invalid, 1)).toBeNull();
      expect(estimateApiCost(tariff, 1, invalid)).toBeNull();
    }
    expect(estimateApiCost(tariff, 1, 1, 101)).toBeNull();
    expect(estimateApiCost(tariff, 1, 1, -1)).toBeNull();
    expect(estimateApiCost(tariff, Number.MAX_VALUE, Number.MAX_VALUE)).toBeNull();
    expect(estimateApiCost({ ...tariff, inputPerMillion: -1 }, 1, 1)).toBeNull();
  });
});
