/**
 * Convert a raw snake_case status string to a human-readable label.
 * Handles underscores and the US→UK spelling of "canceled" → "cancelled".
 */
export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\bcanceled\b/g, "cancelled");
}
