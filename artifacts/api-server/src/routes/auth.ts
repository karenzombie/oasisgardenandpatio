import { Router, type IRouter, type Request } from "express";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getAuth, clerkClient } from "@clerk/express";
import {
  db,
  usersTable,
  customersTable,
  cartsTable,
  cartItemsTable,
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

/**
 * Merge the cart that was being built under a guest session id into the
 * authenticated user's cart.
 *
 * Behaviour:
 * - If the guest cart has no items, simply delete the guest cart (if any).
 * - If the user has no existing cart, re-key the guest cart by setting
 *   `userId` and clearing `sessionId`.
 * - If the user already has a cart, copy each guest line into the user cart
 *   using the same partial unique index used by /cart/items so identical
 *   tuples merge their quantities, then drop the guest cart.
 *
 * Failures are logged but never bubble up — login/signup must still succeed
 * even if cart merging hits a transient db error.
 */
async function mergeGuestCartIntoUserCart(
  req: Request,
  guestSessionId: string,
  userId: number,
): Promise<void> {
  try {
    const [guestCart] = await db
      .select()
      .from(cartsTable)
      .where(
        and(
          eq(cartsTable.sessionId, guestSessionId),
          isNull(cartsTable.userId),
        ),
      )
      .limit(1);
    if (!guestCart) return;

    const guestItems = await db
      .select({ id: cartItemsTable.id })
      .from(cartItemsTable)
      .where(eq(cartItemsTable.cartId, guestCart.id))
      .limit(1);

    if (guestItems.length === 0) {
      await db.delete(cartsTable).where(eq(cartsTable.id, guestCart.id));
      return;
    }

    const [userCart] = await db
      .select()
      .from(cartsTable)
      .where(eq(cartsTable.userId, userId))
      .limit(1);

    if (!userCart) {
      // Re-key the guest cart in place — preserves the cart's createdAt and
      // avoids copying every line.
      await db
        .update(cartsTable)
        .set({ userId, sessionId: null })
        .where(eq(cartsTable.id, guestCart.id));
      return;
    }

    // Existing user cart — copy lines using the same upsert tuple as
    // /cart/items so duplicates accumulate quantities atomically.
    await db.execute(sql`
      INSERT INTO cart_items (cart_id, product_id, variant_id, fabric_id, quantity, price)
      SELECT ${userCart.id}, product_id, variant_id, fabric_id, quantity, price
      FROM cart_items
      WHERE cart_id = ${guestCart.id}
      ON CONFLICT (cart_id, product_id, (COALESCE(variant_id, 0)), (COALESCE(fabric_id, 0)))
      DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
    `);
    await db
      .delete(cartItemsTable)
      .where(eq(cartItemsTable.cartId, guestCart.id));
    await db.delete(cartsTable).where(eq(cartsTable.id, guestCart.id));
  } catch (err) {
    req.log?.warn(
      { err, userId, guestSessionId },
      "failed to merge guest cart into user cart",
    );
  }
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

  // Capture the pre-regenerate session id so any guest cart built up under
  // it can be merged into the new user's cart.
  const guestSessionId = req.session.id;
  await regenerateSession(req);
  req.session.userId = created.id;
  await mergeGuestCartIntoUserCart(req, guestSessionId, created.id);
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

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Clerk-only accounts (signed up via Google / Apple / Clerk email) have
  // no password hash — they must sign in through Clerk, not this endpoint.
  if (!user.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Verified password — only now disclose that the account is disabled,
  // so this endpoint can't be used as an email-enumeration oracle.
  if (!user.isActive) {
    res.status(403).json({
      error:
        "This account has been disabled. Please contact Oasis Garden & Patio at (661) 255-9909 or sales@oasisgardenandpatio.com to have it restored.",
      code: "account_disabled",
    });
    return;
  }

  // Staff (agent / admin) accounts must sign in through the dedicated
  // /staff portal so they pass the 2FA + password-rotation gates. Reject
  // them here only AFTER verifying the password so this endpoint can't be
  // used as an oracle to discover which addresses are staff accounts.
  if (user.role !== "customer") {
    res.status(403).json({
      error:
        "This account belongs to a staff member. Please sign in through the staff portal at /staff.",
      code: "staff_account",
    });
    return;
  }

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const guestSessionId = req.session.id;
  await regenerateSession(req);
  req.session.userId = user.id;
  await mergeGuestCartIntoUserCart(req, guestSessionId, user.id);
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

/**
 * Bridge a Clerk session to a local user row + session cookie.
 *
 * The customer-facing site uses Clerk for sign-up / sign-in (Google, Apple,
 * email). All cart / wishlist / order code keys off `req.session.userId`
 * (a local users.id), so after Clerk authenticates we need to:
 *   1. Find or create a local users row keyed by clerk_user_id
 *   2. Create a matching customers row (so orders can attach to it)
 *   3. Bind req.session.userId and merge any guest cart
 *
 * The frontend calls this once whenever the Clerk user transitions from
 * signed-out to signed-in, then refetches /auth/me.
 */
router.post("/auth/clerk-sync", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Not signed in to Clerk" });
    return;
  }

  let cu;
  try {
    cu = await clerkClient.users.getUser(clerkUserId);
  } catch (err) {
    req.log.error({ err, clerkUserId }, "Failed to fetch Clerk user");
    res.status(502).json({ error: "Could not load Clerk profile" });
    return;
  }

  const primaryEmailId = cu.primaryEmailAddressId;
  const primary = cu.emailAddresses.find((e) => e.id === primaryEmailId);
  const email = primary?.emailAddress?.trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: "Clerk profile is missing an email" });
    return;
  }
  const verified = primary?.verification?.status === "verified";

  // 1) Existing link by clerk_user_id?
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    // 2) Email collision with a legacy local account?
    const [byEmail] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (byEmail) {
      // Refuse to silently take over a legacy account. The user requested
      // a "start fresh" model — anyone whose email matches an existing
      // record needs help from support to consolidate. We also refuse if
      // the row is already linked to a *different* Clerk user, otherwise
      // a new Clerk identity could hijack a previously-claimed row.
      if (
        byEmail.role !== "customer" ||
        byEmail.passwordHash ||
        (byEmail.clerkUserId && byEmail.clerkUserId !== clerkUserId)
      ) {
        res.status(409).json({
          error:
            "An existing account uses this email address. Please contact support to link your accounts.",
          code: "email_collision",
        });
        return;
      }
      // Pure orphan row (no password, no clerk link) — safe to claim.
      // Run claim + customers backfill in one transaction so the mirror
      // invariant (every customer-role users row has a customers row)
      // holds before we bind the session below.
      const claimed = await db.transaction(async (tx) => {
        const [u] = await tx
          .update(usersTable)
          .set({
            clerkUserId,
            firstName: cu.firstName ?? byEmail.firstName,
            lastName: cu.lastName ?? byEmail.lastName,
            emailVerifiedAt: verified ? new Date() : byEmail.emailVerifiedAt,
          })
          .where(eq(usersTable.id, byEmail.id))
          .returning();
        if (!u) throw new Error("Failed to claim user row");
        await tx
          .insert(customersTable)
          .values({
            userId: u.id,
            email,
            firstName: cu.firstName ?? u.firstName ?? "",
            lastName: cu.lastName ?? u.lastName ?? "",
            phone: cu.primaryPhoneNumberId
              ? cu.phoneNumbers.find((p) => p.id === cu.primaryPhoneNumberId)
                  ?.phoneNumber ?? null
              : null,
            customerType: "residential",
          })
          .onConflictDoNothing({ target: customersTable.userId });
        return u;
      });
      user = claimed;
    } else {
      // 3) Brand-new Clerk-backed customer. Two concurrent syncs for the
      // same Clerk user could race here; handle that by retrying once and
      // re-reading by clerk_user_id on a unique-constraint violation.
      try {
        user = await db.transaction(async (tx) => {
          const [u] = await tx
            .insert(usersTable)
            .values({
              email,
              passwordHash: null,
              clerkUserId,
              firstName: cu.firstName,
              lastName: cu.lastName,
              role: "customer",
              emailVerifiedAt: verified ? new Date() : null,
            })
            .returning();
          if (!u) throw new Error("Failed to create user");
          await tx
            .insert(customersTable)
            .values({
              userId: u.id,
              email,
              firstName: cu.firstName ?? "",
              lastName: cu.lastName ?? "",
              phone: cu.primaryPhoneNumberId
                ? cu.phoneNumbers.find((p) => p.id === cu.primaryPhoneNumberId)
                    ?.phoneNumber ?? null
                : null,
              customerType: "residential",
            })
            .onConflictDoNothing({ target: customersTable.userId });
          return u;
        });
      } catch (err) {
        // Likely a unique-violation on clerk_user_id or email from a
        // concurrent sync. Re-read; if still missing, surface the error.
        const [racedRow] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.clerkUserId, clerkUserId))
          .limit(1);
        if (!racedRow) {
          req.log.error({ err, clerkUserId, email }, "clerk-sync insert failed");
          res.status(500).json({ error: "Could not provision account" });
          return;
        }
        user = racedRow;
      }
    }
  }

  if (!user) {
    res.status(500).json({ error: "Could not provision account" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({
      error:
        "This account has been disabled. Please contact Oasis Garden & Patio at (661) 255-9909 or sales@oasisgardenandpatio.com to have it restored.",
      code: "account_disabled",
    });
    return;
  }

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  // If this Clerk user is already bound to the current Express session,
  // skip session regeneration / cart merging.
  if (req.session.userId === user.id) {
    res.status(200).json(toCurrentUser(user));
    return;
  }

  const guestSessionId = req.session.id;
  await regenerateSession(req);
  req.session.userId = user.id;
  await mergeGuestCartIntoUserCart(req, guestSessionId, user.id);
  await saveSession(req);

  res.status(200).json(toCurrentUser(user));
});

export default router;
