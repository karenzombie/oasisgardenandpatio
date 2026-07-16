/**
 * Coerces `availableOnline` and `quoteOnly` so they remain inverses.
 * `quoteOnly` is authoritative when present in the write.
 * If neither is present, returns an empty object (leave both untouched).
 * Never touches `showPriceOnline`.
 */
export function coerceAvailabilityFlags(flags: {
  availableOnline?: boolean;
  quoteOnly?: boolean;
}): { availableOnline?: boolean; quoteOnly?: boolean } {
  if (flags.quoteOnly !== undefined) {
    return { availableOnline: !flags.quoteOnly, quoteOnly: flags.quoteOnly };
  }
  if (flags.availableOnline !== undefined) {
    return { availableOnline: flags.availableOnline, quoteOnly: !flags.availableOnline };
  }
  return {};
}
