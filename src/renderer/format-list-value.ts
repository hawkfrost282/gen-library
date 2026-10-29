import type { TableValue } from "../shared/asset-table";
import type { AppLocale } from "./i18n";
import { translateForLocale } from "./i18n";
import { formatBytes } from "./format-file-meta";

const dateFormatters = new Map<AppLocale, Intl.DateTimeFormat>();
const DATE_COLUMNS = new Set([
  "modifiedAt",
  "createdAt",
  "updatedAt",
  "ai.generatedAt",
]);

/** Display formatting only; worker sorting always receives original values. */
export function formatListValue(
  value: TableValue | undefined,
  column: string,
  locale: AppLocale,
): string {
  if (value == null || value === "") return "—";
  if (DATE_COLUMNS.has(column)) {
    const date = new Date(String(value));
    if (Number.isNaN(date.valueOf())) return String(value);
    let formatter = dateFormatters.get(locale);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      dateFormatters.set(locale, formatter);
    }
    return formatter.format(date);
  }
  if (column === "byteSize") return formatBytes(Number(value));
  if (column === "rating")
    return Number(value)
      ? "★".repeat(Math.min(5, Math.max(0, Number(value))))
      : translateForLocale(locale, "listView.unrated");
  if (column === "favorite") return value ? "♥" : "—";
  if (typeof value === "boolean")
    return translateForLocale(locale, value ? "common.yes" : "common.no");
  return String(value);
}
