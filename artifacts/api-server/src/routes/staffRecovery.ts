import { Router, type IRouter, type Request } from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNull, ne, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  adminRecoveryTokensTable,
  type AdminRecoveryToken,
  type User,
} from "@workspace/db";
import {
  RequestStaffRecoveryBody,
  CompleteStaffRecoveryBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import {
  adminRecoveryRequestRateLimiter,
  adminRecoveryStatusRateLimiter,
  adminRecoveryCompleteRateLimiter,
} from "../middlewares/rateLimit";
import {
  sendRecoveryRequestedEmail,
  sendRecoveryAlertEmail,
  sendRecoveryFinalizedEmail,
  maskEmail,
} from "../lib/recoveryEmail";
import { recordAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BCRYPT_ROUNDS = 12;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours total link lifetime

function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Returns the trusted public base URL for emailed security links.
 *
 * SECURITY: never derived from request headers — Host can be attacker
 * controlled. If no trusted source is configured we return null and the
 * caller must skip emailing a link.
 */
function trustedBaseUrl(): string | null {
  const explicit = process.env["PUBLIC_BASE_URL"]?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const replitDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  return null;
}

function clientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? null;
}

function tokenState(
  row: AdminRecoveryToken,
  now: Date,
): "ready" | "expired" | "used" | "cancelled" {
  if (row.usedAt) return "used";
  if (row.cancelledAt) return "cancelled";
  if (now >= row.expiresAt) return "expired";
  return "ready";
}

// Look up a token row by raw token, in constant-ish time.
async function findTokenByRaw(
  raw: string,
): Promise<AdminRecoveryToken | null> {
  if (!raw || raw.length < 32 || raw.length > 256) return null;
  const hash = hashToken(raw);
  const [row] = await db
    .select()
    .from(adminRecoveryTokensTable)
    .where(eq(adminRecoveryTokensTable.tokenHash, hash))
    .limit(1);
  return row ?? null;
}

router.post(
  "/auth/staff/recover/request",
  adminRecoveryRequestRateLimiter,
  async (req, res) => {
    const parsed = RequestStaffRecoveryBody.safeParse(req.body);
    if (!parsed.success) {
      // Don't leak shape — still return ok.
      res.json({ ok: true });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const ip = clientIp(req);
    const ua = req.headers["user-agent"];
    const userAgent = typeof ua === "string" ? ua : null;

    try {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      const isStaff =
        !!user && user.isActive && (user.role === "admin" || user.role === "agent");

      if (!isStaff || !user) {
        // Audit silently and return ok regardless.
        await recordAudit(req, {
          action: "staff_recovery.request_unknown_email",
          changes: { email },
        });
        res.json({ ok: true });
        return;
      }

      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TTL_MS);

      // Cancel any prior active tokens for this user so only the newest
      // request is valid. Without this, an attacker who somehow obtains an
      // old emailed token could still complete the reset.
      const created = await db.transaction(async (tx) => {
        await tx
          .update(adminRecoveryTokensTable)
          .set({ cancelledAt: now })
          .where(
            and(
              eq(adminRecoveryTokensTable.userId, user.id),
              isNull(adminRecoveryTokensTable.usedAt),
              isNull(adminRecoveryTokensTable.cancelledAt),
              gt(adminRecoveryTokensTable.expiresAt, now),
            ),
          );
        const [row] = await tx
          .insert(adminRecoveryTokensTable)
          .values({
            userId: user.id,
            tokenHash,
            expiresAt,
            requestIp: ip,
            requestUserAgent: userAgent,
          })
          .returning({ id: adminRecoveryTokensTable.id });
        return row;
      });

      await recordAudit(req, {
        action: "staff_recovery.requested",
        entityType: "user",
        entityId: user.id,
        changes: { tokenId: created?.id, expiresAt },
      });

      const baseUrl = trustedBaseUrl();
      if (!baseUrl) {
        logger.error(
          { tokenId: created?.id },
          "PUBLIC_BASE_URL/REPLIT_DOMAINS not set — refusing to email recovery link with untrusted host header",
        );
        // Token row already written + audited; intentionally still respond ok
        // to avoid leaking config state. Admins can fix env and re-request.
        res.json({ ok: true });
        return;
      }
      const recoveryUrl = `${baseUrl}/staff/recover/${rawToken}`;
      const staffAccountsUrl = `${baseUrl}/admin/users`;

      // Fire-and-forget emails — never block response. Both the staff
      // member and the store's main inbox are notified at the same time,
      // immediately on submission (no cooldown).
      void sendRecoveryRequestedEmail({
        to: user.email,
        recoveryUrl,
        expiresAt,
        requestIp: ip,
        requestUserAgent: userAgent,
      }).catch((err) => {
        logger.error(
          { err, userId: user.id },
          "Failed to send recovery requested email",
        );
      });

      void sendRecoveryAlertEmail({
        targetEmail: user.email,
        staffAccountsUrl,
        requestIp: ip,
        requestUserAgent: userAgent,
      }).catch((err) => {
        logger.error(
          { err, userId: user.id },
          "Failed to send recovery alert email",
        );
      });
    } catch (err) {
      logger.error({ err }, "staff recovery request failed");
      // Still return ok to avoid leaking errors / existence.
    }
    res.json({ ok: true });
  },
);

router.get(
  "/auth/staff/recover/:token",
  adminRecoveryStatusRateLimiter,
  async (req, res) => {
    const raw = String(req.params.token ?? "");
    const row = await findTokenByRaw(raw);
    if (!row) {
      res.json({
        state: "not_found",
        expiresAt: null,
        emailMasked: null,
      });
      return;
    }
    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, row.userId))
      .limit(1);
    const state = tokenState(row, new Date());
    res.json({
      state,
      expiresAt: row.expiresAt.toISOString(),
      emailMasked: user ? maskEmail(user.email) : null,
    });
  },
);

router.post(
  "/auth/staff/recover/:token/complete",
  adminRecoveryCompleteRateLimiter,
  async (req, res) => {
    const raw = String(req.params.token ?? "");
    const parsed = CompleteStaffRecoveryBody.safeParse(req.body);
    if (!parsed.success) {
      await recordAudit(req, {
        action: "staff_recovery.complete_rejected",
        changes: { reason: "weak_password" },
      });
      res
        .status(400)
        .json({ error: "Password must be at least 12 characters" });
      return;
    }
    const row = await findTokenByRaw(raw);
    if (!row) {
      await recordAudit(req, {
        action: "staff_recovery.complete_rejected",
        changes: { reason: "unknown_token" },
      });
      res.status(400).json({ error: "Invalid or expired recovery link" });
      return;
    }
    // Constant-time re-check to be defensive against timing.
    const a = Buffer.from(hashToken(raw));
    const b = Buffer.from(row.tokenHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await recordAudit(req, {
        action: "staff_recovery.complete_rejected",
        changes: { reason: "hash_mismatch", tokenId: row.id },
      });
      res.status(400).json({ error: "Invalid or expired recovery link" });
      return;
    }
    const now = new Date();
    const state = tokenState(row, now);
    if (state !== "ready") {
      const messages: Record<Exclude<typeof state, "ready">, string> = {
        expired: "This recovery link has expired.",
        used: "This recovery link has already been used.",
        cancelled:
          "This recovery link was cancelled by another administrator.",
      };
      await recordAudit(req, {
        action: "staff_recovery.complete_rejected",
        entityType: "user",
        entityId: row.userId,
        changes: { reason: state, tokenId: row.id },
      });
      res.status(400).json({ error: messages[state] });
      return;
    }

    const passwordHash = await bcrypt.hash(
      parsed.data.newPassword,
      BCRYPT_ROUNDS,
    );

    // Atomic finalization: only succeeds if the token is still in the
    // "ready" state at write time. Prevents double-use and complete/cancel
    // races (the loser sees 0 rows and aborts).
    const claimed = await db.transaction(async (tx) => {
      const updated = await tx
        .update(adminRecoveryTokensTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(adminRecoveryTokensTable.id, row.id),
            isNull(adminRecoveryTokensTable.usedAt),
            isNull(adminRecoveryTokensTable.cancelledAt),
            gt(adminRecoveryTokensTable.expiresAt, now),
          ),
        )
        .returning({ id: adminRecoveryTokensTable.id });
      if (updated.length === 0) return false;
      // Invalidate any other still-active tokens for this user so a single
      // successful reset terminates all sibling links.
      await tx
        .update(adminRecoveryTokensTable)
        .set({ cancelledAt: now })
        .where(
          and(
            eq(adminRecoveryTokensTable.userId, row.userId),
            ne(adminRecoveryTokensTable.id, row.id),
            isNull(adminRecoveryTokensTable.usedAt),
            isNull(adminRecoveryTokensTable.cancelledAt),
            gt(adminRecoveryTokensTable.expiresAt, now),
          ),
        );
      await tx
        .update(usersTable)
        .set({
          passwordHash,
          mustChangePassword: false,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorEnrolledAt: null,
          twoFactorRecoveryCodes: [],
          isActive: true,
        })
        .where(eq(usersTable.id, row.userId));
      return true;
    });

    if (!claimed) {
      await recordAudit(req, {
        action: "staff_recovery.complete_rejected",
        entityType: "user",
        entityId: row.userId,
        changes: { reason: "race_lost", tokenId: row.id },
      });
      res
        .status(400)
        .json({ error: "This recovery link is no longer usable." });
      return;
    }

    await recordAudit(req, {
      action: "staff_recovery.completed",
      entityType: "user",
      entityId: row.userId,
      changes: { tokenId: row.id },
    });

    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, row.userId))
      .limit(1);
    if (user) {
      void sendRecoveryFinalizedEmail({
        to: user.email,
        reason: "completed",
      }).catch((err) => {
        logger.error(
          { err, userId: row.userId },
          "Failed to send recovery completed email",
        );
      });
    }

    res.json({ ok: true });
  },
);

router.get(
  "/admin/recovery-requests",
  requireAuth,
  requireRole("admin"),
  async (_req, res) => {
    const now = new Date();
    const rows = await db
      .select({
        id: adminRecoveryTokensTable.id,
        userId: adminRecoveryTokensTable.userId,
        userEmail: usersTable.email,
        userRole: usersTable.role,
        requestedAt: adminRecoveryTokensTable.requestedAt,
        expiresAt: adminRecoveryTokensTable.expiresAt,
        requestIp: adminRecoveryTokensTable.requestIp,
        requestUserAgent: adminRecoveryTokensTable.requestUserAgent,
      })
      .from(adminRecoveryTokensTable)
      .innerJoin(
        usersTable,
        eq(usersTable.id, adminRecoveryTokensTable.userId),
      )
      .where(
        and(
          isNull(adminRecoveryTokensTable.usedAt),
          isNull(adminRecoveryTokensTable.cancelledAt),
          gt(adminRecoveryTokensTable.expiresAt, now),
        ),
      )
      .orderBy(asc(adminRecoveryTokensTable.requestedAt));

    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userEmail: r.userEmail,
        userRole: r.userRole,
        requestedAt: r.requestedAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        requestIp: r.requestIp,
        requestUserAgent: r.requestUserAgent,
      })),
    );
  },
);

router.post(
  "/admin/recovery-requests/:id/cancel",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const id = Number(String(req.params.id ?? ""));
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const now = new Date();
    const cancellingUser = req.user as User;

    // Atomic conditional cancel — only wins if the token is still pending or
    // ready (not used, not already cancelled, not expired).
    const cancelled = await db
      .update(adminRecoveryTokensTable)
      .set({ cancelledAt: now, cancelledByUserId: cancellingUser.id })
      .where(
        and(
          eq(adminRecoveryTokensTable.id, id),
          isNull(adminRecoveryTokensTable.usedAt),
          isNull(adminRecoveryTokensTable.cancelledAt),
          gt(adminRecoveryTokensTable.expiresAt, now),
        ),
      )
      .returning({
        id: adminRecoveryTokensTable.id,
        userId: adminRecoveryTokensTable.userId,
      });

    const row = cancelled[0];
    if (!row) {
      await recordAudit(req, {
        action: "staff_recovery.cancel_rejected",
        changes: { reason: "not_found_or_finalized", tokenId: id },
      });
      res.status(404).json({ error: "Not found or already finalized" });
      return;
    }

    await recordAudit(req, {
      action: "staff_recovery.cancelled",
      entityType: "user",
      entityId: row.userId,
      changes: { tokenId: row.id },
    });

    const [target] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, row.userId))
      .limit(1);
    if (target) {
      void sendRecoveryFinalizedEmail({
        to: target.email,
        reason: "cancelled",
        cancelledByEmail: cancellingUser.email,
      }).catch((err) => {
        logger.error(
          { err, userId: row.userId },
          "Failed to send recovery cancelled email",
        );
      });
    }

    res.json({ ok: true });
  },
);

export default router;
