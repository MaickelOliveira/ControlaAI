import { describe, it, expect } from "vitest";
import { spToUTC, formatDateBR, formatTimeBR } from "./date-br";

describe("spToUTC", () => {
  it("converts a naive SP datetime (UTC-3) to UTC", () => {
    expect(spToUTC("2026-07-04T08:00:00")).toBe("2026-07-04T11:00:00.000Z");
  });

  it("respects an explicit Z suffix instead of assuming SP time", () => {
    expect(spToUTC("2026-07-04T08:00:00Z")).toBe("2026-07-04T08:00:00.000Z");
  });

  it("respects an explicit timezone offset", () => {
    expect(spToUTC("2026-07-04T08:00:00+00:00")).toBe("2026-07-04T08:00:00.000Z");
  });

  it("passes through an empty string unchanged", () => {
    expect(spToUTC("")).toBe("");
  });
});

describe("formatDateBR", () => {
  it("formats a UTC ISO string as DD/MM/YYYY in the São Paulo timezone", () => {
    expect(formatDateBR("2026-07-04T11:00:00.000Z")).toBe("04/07/2026");
  });
});

describe("formatTimeBR", () => {
  it("formats a UTC ISO string as HH:MM in the São Paulo timezone", () => {
    expect(formatTimeBR("2026-07-04T11:00:00.000Z")).toBe("08:00");
  });
});
