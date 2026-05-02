import { Router, type IRouter, type Request } from "express";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  customersTable,
  emailVerificationTokensTable,
  passwordResetTokensTable,
  type User,
} from "@workspace/db";
import {
  SignupBody,
  LoginBody,
  VerifyEmailBody,
  RequestPasswordResetBody,
  ResetPasswordBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email";
import {
  loginRateLimiter,
  passwordResetRateLimiter,
  resendVerificationRateLimiter,
} from "../middlewares/rateLimit";

const router: IRouter = Router();

const BCRYPT_ROUNDS = 12;
const VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60;

function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function publicBaseUrl(req: Request): string {
  const replitDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const host = req.get("host") ?? "localhost";
  const proto = req.protocol || "http";
  return `${proto}://${host}`;
}

function toCurrentUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as "customer" | "agent" | "admin",
    emailVerified: user.emailVerifiedAt !== null,
  };
}

async function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

async function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

async function issueVerificationEmail(
  req: Request,
  user: User,
): Promise<void> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
  await db.insert(emailVerificationTokensTable).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });
  const verificationUrl = `${publicBaseUrl(req)}/verify-email?token=${encodeURIComponent(rawToken)}`;
  await sendVerificationEmail({
    to: user.email,
    firstName: user.firstName,
    verificationUrl,
  });
}

router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, firstName, lastName, phone } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(usersTable)
      .values({
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName,
        role: "customer",
      })
      .returning();

    if (!user) throw new Error("Failed to create user");

    await tx.insert(customersTable).values({
      userId: user.id,
      email: normalizedEmail,
      firstName,
      lastName,
      phone: phone ?? null,
      customerType: "residential",
    });

    return user;
  });

  try {
    await issueVerificationEmail(req, created);
  } catch (err) {
    req.log.error({ err, userId: created.id }, "Failed to send verification email on signup");
  }

  await regenerateSession(req);
  req.session.userId = created.id;
  await saveSession(req);

  res.status(201).json(toCurrentUser(created));
});

router.post("/auth/login", loginRateLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
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

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  await regenerateSession(req);
  req.session.userId = user.id;
  await saveSession(req);

  res.status(200).json(toCurrentUser(user));
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      req.log.error({ err }, "Failed to destroy session on logout");
      res.status(500).json({ error: "Failed to log out" });
      return;
    }
    res.clearCookie("oasis.sid", { path: "/" });
    res.status(204).end();
  });
});

router.get("/auth/me", requireAuth, (req, res): void => {
  res.status(200).json(toCurrentUser(req.user!));
});

router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = VerifyEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const tokenHash = hashToken(parsed.data.token);

  const [consumed] = await db
    .update(emailVerificationTokensTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailVerificationTokensTable.tokenHash, tokenHash),
        isNull(emailVerificationTokensTable.usedAt),
        gt(emailVerificationTokensTable.expiresAt, now),
      ),
    )
    .returning();

  if (!consumed) {
    res.status(400).json({ error: "This verification link is invalid or has expired" });
    return;
  }

  const [verifiedUser] = await db
    .update(usersTable)
    .set({ emailVerifiedAt: now })
    .where(eq(usersTable.id, consumed.userId))
    .returning();

  if (!verifiedUser) {
    res.status(400).json({ error: "User no longer exists" });
    return;
  }

  res.status(200).json(toCurrentUser(verifiedUser));
});

router.post(
  "/auth/resend-verification",
  resendVerificationRateLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const user = req.user!;
    if (user.emailVerifiedAt) {
      res.status(204).end();
      return;
    }

    try {
      await issueVerificationEmail(req, user);
    } catch (err) {
      req.log.error({ err, userId: user.id }, "Failed to resend verification email");
      res.status(500).json({ error: "Failed to send verification email" });
      return;
    }

    res.status(204).end();
  },
);

router.post(
  "/auth/request-password-reset",
  passwordResetRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = RequestPasswordResetBody.safeParse(req.body);
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

    if (user && user.isActive) {
      try {
        const rawToken = generateRawToken();
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await db.insert(passwordResetTokensTable).values({
          userId: user.id,
          tokenHash,
          expiresAt,
        });
        const resetUrl = `${publicBaseUrl(req)}/reset-password?token=${encodeURIComponent(rawToken)}`;
        await sendPasswordResetEmail({
          to: user.email,
          firstName: user.firstName,
          resetUrl,
        });
      } catch (err) {
        req.log.error({ err, userId: user.id }, "Failed to send password reset email");
      }
    }

    res.status(204).end();
  },
);

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const tokenHash = hashToken(parsed.data.token);

  const [consumed] = await db
    .update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, now),
      ),
    )
    .returning();

  if (!consumed) {
    res.status(400).json({ error: "This reset link is invalid or has expired" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS);

  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, consumed.userId));

    await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokensTable.userId, consumed.userId),
          isNull(passwordResetTokensTable.usedAt),
        ),
      );
  });

  res.status(204).end();
});

export default router;
