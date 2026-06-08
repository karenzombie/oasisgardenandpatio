/**
 * Returns the first paragraph of a description for use as a short teaser.
 *
 * Splits on the first blank line (one or more newlines with optional
 * whitespace between). If the text has no paragraph break it is returned
 * whole. The result is trimmed. Unlike a hard character truncation this
 * never cuts a sentence mid-word and never appends an ellipsis, so the full
 * leading paragraph of the source copy is preserved.
 */
export function firstParagraph(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/^\s+/, "");
  const idx = normalized.search(/\n\s*\n/);
  return (idx === -1 ? normalized : normalized.slice(0, idx)).trim();
}
