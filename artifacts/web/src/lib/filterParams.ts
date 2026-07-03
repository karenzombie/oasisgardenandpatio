// Shared helpers for encoding multi-select filter facets (category,
// sub-category, manufacturer, material, collection) as a single
// comma-separated query-string value. Within a facet, multiple selected
// values are OR'd together server-side; across facets they combine with AND.
export function parseListParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinListParam(values: string[]): string | null {
  return values.length ? values.join(",") : null;
}

export function toggleListValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}
