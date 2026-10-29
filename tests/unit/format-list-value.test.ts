import { expect, it } from "vitest";
import { formatListValue } from "../../src/renderer/format-list-value";
it("preserves exact generation seeds and formats missing and boolean metadata", () => {
  expect(formatListValue("18446744073709551615", "generation.seed", "en")).toBe("18446744073709551615");
  expect(formatListValue(undefined, "technical.iso", "en")).toBe("—");
  expect(formatListValue(0, "rating", "en")).toBe("Unrated");
  expect(formatListValue(5, "rating", "en")).toBe("★★★★★");
  expect(formatListValue(false, "technical.hasAudio", "en")).toBe("No");
  expect(formatListValue(false, "technical.hasAudio", "zh-CN")).toBe("否");
  expect(formatListValue("invalid date", "modifiedAt", "en")).toBe("invalid date");
  expect(formatListValue("2026-01-01T12:00:00Z", "modifiedAt", "en")).toContain("2026");
});
