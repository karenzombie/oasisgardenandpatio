import type { Request } from "express";
import { db, auditLogTable } from "@workspace/db";
import { logger } from "./logger";

export interface AuditEvent {
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  changes?: unknown;
}

function clientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? null;
}

/**
 * Best-effort write into `audit_log`. Never throws — failures are logged so
 * they cannot break the calling mutation. The userId is taken from the
 * session (so `requireAuth` should have already run).
 */
export async function recordAudit(
  req: Request,
  event: AuditEvent,
): Promise<void> {
  try {
    const userId = req.session?.userId ?? null;
    const ua = req.headers["user-agent"];
    await db.insert(auditLogTable).values({
      userId,
      action: event.action,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      changes:
        event.changes === undefined ? null : (event.changes as object),
      ipAddress: clientIp(req),
      userAgent: typeof ua === "string" ? ua : null,
    });
  } catch (err) {
    logger.warn(
      { err, action: event.action },
      "Failed to write audit_log row",
    );
  }
}
