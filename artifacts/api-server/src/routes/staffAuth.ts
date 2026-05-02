import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable, type User } from "@workspace/db";
import {
  StaffLoginBody,
  StaffVerifySetupTotpBody,
  StaffVerifyTotpBody,
  StaffVerifyRecoveryCodeBody,
  StaffChangePasswordBody,
} from "@workspace/api-zod";
import { loginRateLimiter, twoFactorRateLimiter } from "../middlewares/rateLimit";
import { requireAuth } from "../middlewares/requireAuth";
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  buildQrDataUrl,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCodes,
  consumeRecoveryCode,
} from "../lib/totp";

const router: IRouter = Router();
const BCRYPT_ROUNDS = 12;

type StaffStage =
  | "needs_2fa_setup"
  | "needs_2fa_verify"
  | "needs_password_change"
  | "complete";

function toStaffUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as "agent" | "admin",
    twoFactorEnabled: user.twoFactorEnabled,
    mustChangePassword: user.mustChangePassword,
  };
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

async function loadPendingStaffUser(req: Request): Promise<User | null> {
  if (!req.session.pendingStaffUserId) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.pendingStaffUserId))
    .limit(1);
  if (!user || !user.isActive) return null;
  if (user.role !== "agent" && user.role !== "admin") return null;
  return user;
}

async function completeStaffLogin(req: Request, user: User): Promise<void> {
  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));
  await regenerateSession(req);
  req.session.userId = user.id;
  delete req.session.pendingStaffUserId;
  delete req.session.pendingStaffStage;
  delete req.session.pendingTotpSecret;
  await saveSession(req);
}

function nextStageAfter2fa(user: User): StaffStage {
  return user.mustChangePassword ? "needs_password_change" : "complete";
}

router.post(
  "/auth/staff/login",
  loginRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = StaffLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (
      !user ||
      !user.isActive ||
      (user.role !== "agent" && user.role !== "admin")
    ) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await regenerateSession(req);
    req.session.pendingStaffUserId = user.id;
    delete req.session.pendingTotpSecret;

    const stage: "needs_2fa_setup" | "needs_2fa_verify" =
      user.twoFactorEnabled ? "needs_2fa_verify" : "needs_2fa_setup";
    req.session.pendingStaffStage = stage;
    await saveSession(req);

    res.status(200).json({ stage, user: toStaffUser(user) });
  },
);

router.get("/auth/staff/state", async (req, res): Promise<void> => {
  if (req.session.userId) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);
    if (user && (user.role === "agent" || user.role === "admin")) {
      res.json({ stage: "complete", user: toStaffUser(user) });
      return;
    }
  }
  const pending = await loadPendingStaffUser(req);
  if (!pending) {
    res.status(401).json({ stage: "anonymous" });
    return;
  }
  res.json({
    stage: req.session.pendingStaffStage ?? "needs_2fa_setup",
    user: toStaffUser(pending),
  });
});

router.post(
  "/auth/staff/2fa/setup-init",
  twoFactorRateLimiter,
  async (req, res): Promise<void> => {
    if (req.session.pendingStaffStage !== "needs_2fa_setup") {
      res.status(400).json({ error: "Not in 2FA setup stage" });
      return;
    }
    const user = await loadPendingStaffUser(req);
    if (!user) {
      res.status(401).json({ error: "Login required" });
      return;
    }

    const secret = generateTotpSecret();
    req.session.pendingTotpSecret = secret;
    await saveSession(req);

    const otpAuthUrl = buildOtpAuthUrl(user.email, secret);
    const qrDataUrl = await buildQrDataUrl(otpAuthUrl);
    res.json({ otpAuthUrl, qrDataUrl, manualEntryKey: secret });
  },
);

router.post(
  "/auth/staff/2fa/setup-verify",
  twoFactorRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = StaffVerifySetupTotpBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (req.session.pendingStaffStage !== "needs_2fa_setup") {
      res.status(400).json({ error: "Not in 2FA setup stage" });
      return;
    }
    const user = await loadPendingStaffUser(req);
    if (!user) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    const secret = req.session.pendingTotpSecret;
    if (!secret) {
      res.status(400).json({ error: "Setup not initialized" });
      return;
    }
    if (!(await verifyTotpCode(secret, parsed.data.code))) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    const recoveryCodes = generateRecoveryCodes();
    const hashedRecovery = await hashRecoveryCodes(recoveryCodes);

    await db
      .update(usersTable)
      .set({
        twoFactorEnabled: true,
        twoFactorSecret: secret,
        twoFactorEnrolledAt: new Date(),
        twoFactorRecoveryCodes: hashedRecovery,
      })
      .where(eq(usersTable.id, user.id));

    delete req.session.pendingTotpSecret;
    const refreshed = { ...user, twoFactorEnabled: true };
    const next = nextStageAfter2fa(refreshed);

    if (next === "complete") {
      await completeStaffLogin(req, refreshed);
      res.json({
        stage: "complete",
        user: toStaffUser(refreshed),
        recoveryCodes,
      });
      return;
    }

    req.session.pendingStaffStage = "needs_password_change";
    await saveSession(req);
    res.json({
      stage: "needs_password_change",
      user: toStaffUser(refreshed),
      recoveryCodes,
    });
  },
);

router.post(
  "/auth/staff/2fa/verify",
  twoFactorRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = StaffVerifyTotpBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (req.session.pendingStaffStage !== "needs_2fa_verify") {
      res.status(400).json({ error: "Not in 2FA verify stage" });
      return;
    }
    const user = await loadPendingStaffUser(req);
    if (!user || !user.twoFactorSecret) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    if (!(await verifyTotpCode(user.twoFactorSecret, parsed.data.code))) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    const next = nextStageAfter2fa(user);
    if (next === "complete") {
      await completeStaffLogin(req, user);
      res.json({ stage: "complete", user: toStaffUser(user) });
      return;
    }
    req.session.pendingStaffStage = "needs_password_change";
    await saveSession(req);
    res.json({ stage: "needs_password_change", user: toStaffUser(user) });
  },
);

router.post(
  "/auth/staff/2fa/recovery",
  twoFactorRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = StaffVerifyRecoveryCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (req.session.pendingStaffStage !== "needs_2fa_verify") {
      res.status(400).json({ error: "Not in 2FA verify stage" });
      return;
    }
    const user = await loadPendingStaffUser(req);
    if (!user) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    const stored = user.twoFactorRecoveryCodes ?? [];
    const result = await consumeRecoveryCode(stored, parsed.data.code);
    if (!result.matched) {
      res.status(400).json({ error: "Invalid recovery code" });
      return;
    }
    await db
      .update(usersTable)
      .set({ twoFactorRecoveryCodes: result.remaining })
      .where(eq(usersTable.id, user.id));

    const next = nextStageAfter2fa(user);
    if (next === "complete") {
      await completeStaffLogin(req, user);
      res.json({
        stage: "complete",
        user: toStaffUser(user),
        recoveryCodesRemaining: result.remaining.length,
      });
      return;
    }
    req.session.pendingStaffStage = "needs_password_change";
    await saveSession(req);
    res.json({
      stage: "needs_password_change",
      user: toStaffUser(user),
      recoveryCodesRemaining: result.remaining.length,
    });
  },
);

router.post(
  "/auth/staff/change-password",
  async (req, res): Promise<void> => {
    const parsed = StaffChangePasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    let user: User | null = null;
    let isPending = false;

    if (req.session.userId) {
      const [u] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, req.session.userId))
        .limit(1);
      if (u && u.isActive && (u.role === "agent" || u.role === "admin")) {
        user = u;
      }
    } else if (req.session.pendingStaffStage === "needs_password_change") {
      user = await loadPendingStaffUser(req);
      isPending = true;
    }

    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const ok = await bcrypt.compare(
      parsed.data.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }
    if (parsed.data.currentPassword === parsed.data.newPassword) {
      res.status(400).json({
        error: "New password must be different from the current password",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS);
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(usersTable.id, user.id));

    const updated = { ...user, mustChangePassword: false };

    if (isPending) {
      await completeStaffLogin(req, updated);
    }
    res.json({ stage: "complete", user: toStaffUser(updated) });
  },
);

router.post(
  "/auth/staff/2fa/disable",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = req.user!;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Only admins can disable their 2FA" });
      return;
    }
    await db
      .update(usersTable)
      .set({
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorEnrolledAt: null,
        twoFactorRecoveryCodes: [],
      })
      .where(eq(usersTable.id, user.id));
    res.json({ ok: true });
  },
);

export default router;
