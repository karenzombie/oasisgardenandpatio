export function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i += 1) {
    const code = (cur as { code?: unknown })?.code;
    if (code === "23505") return true;
    cur = (cur as { cause?: unknown })?.cause;
  }
  return false;
}
