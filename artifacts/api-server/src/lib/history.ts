import type { Request } from "express";
import { db, entityHistoryTable } from "@workspace/db";
import { logger } from "./logger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type HistoryChangeType = "create" | "update" | "delete" | "replace";

export interface RecordHistoryArgs {
  entityType: string;
  entityId: number;
  changeType: HistoryChangeType;
  snapshot: unknown;
  previousSnapshot?: unknown;
  notes?: string;
  /**
   * Pass the surrounding transaction handle so the history row commits
   * atomically with the live update. Falls back to top-level db when
   * omitted (acceptable for follow-up history after a successful write).
   */
  tx?: Tx;
}

/**
 * Append a snapshot to `entity_history` describing a mutation to an entity.
 *
 * Best-effort: failures are logged but never thrown, so a history-write
 * problem cannot break the calling mutation. Pass `tx` whenever you can —
 * that way history and the live row commit (or roll back) together.
 *
 * The actor (userId + email) is taken from req.session / req.user so
 * `requireAuth` should have already run.
 */
export async function recordHistory(
  req: Request,
  args: RecordHistoryArgs,
): Promise<void> {
  try {
    const userId = req.session?.userId ?? null;
    const email = (req.user?.email as string | undefined) ?? null;
    const runner = args.tx ?? db;
    await runner.insert(entityHistoryTable).values({
      entityType: args.entityType,
      entityId: args.entityId,
      changeType: args.changeType,
      snapshot: args.snapshot as object,
      previousSnapshot:
        args.previousSnapshot === undefined
          ? null
          : (args.previousSnapshot as object),
      changedByUserId: userId,
      changedByEmail: email,
      notes: args.notes ?? null,
    });
  } catch (err) {
    logger.warn(
      {
        err,
        entityType: args.entityType,
        entityId: args.entityId,
        changeType: args.changeType,
      },
      "Failed to write entity_history row",
    );
  }
}
