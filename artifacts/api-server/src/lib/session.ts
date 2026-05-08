import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import type { RequestHandler } from "express";
import { logger } from "./logger";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    pendingStaffUserId?: number;
    pendingStaffStage?:
      | "needs_2fa_setup"
      | "needs_2fa_verify"
      | "needs_password_change";
    pendingTotpSecret?: string;
    /**
     * Order numbers placed by this browser as a guest. Lets the order
     * confirmation page show the just-placed order without requiring an
     * account. Capped at the most recent 25 entries.
     */
    guestOrders?: string[];
    /**
     * Set the first time this browser interacts with the cart as a guest.
     * Forces express-session (configured with `saveUninitialized: false`)
     * to persist the session and issue `Set-Cookie`, so subsequent requests
     * carry the same session id we used as the cart's `sessionId` key.
     */
    guestCart?: boolean;
  }
}

const PgStore = connectPgSimple(session);

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Dedicated pool for the session store. Kept separate from the main app
 * pool so that session-store connection failures don't exhaust the shared
 * pool and block non-session DB queries. A short connectionTimeoutMillis
 * ensures session operations fail fast (≤5 s) instead of hanging the
 * entire request pipeline when the DB control plane is temporarily
 * unavailable.
 */
function buildSessionPool(): pg.Pool {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err: Error) => {
    logger.error({ err }, "session-pool idle client error");
  });
  return pool;
}

export function buildSessionMiddleware(): RequestHandler {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  // The app is always served over HTTPS in Replit (dev preview uses the
  // worf.replit.dev TLS proxy; production is published behind HTTPS too).
  // SameSite=None + Secure is required for the session cookie to be
  // accepted by browsers when the app runs inside Replit's cross-site
  // workspace canvas iframe; SameSite=Lax silently drops the cookie there
  // and every /auth/me check fails immediately after login.
  const isHttps = process.env["NODE_ENV"] === "production"
    || Boolean(process.env["REPLIT_DOMAINS"]);

  const store = new PgStore({
    pool: buildSessionPool(),
    tableName: "sessions",
    // Auto-create the sessions table if it doesn't exist yet (e.g. on a
    // fresh production deploy before the Drizzle migration has run, or if
    // the table was accidentally dropped). connect-pg-simple uses the
    // official CREATE TABLE statement from its own bundled SQL, which matches
    // the schema declared in lib/db/src/schema/users.ts.
    createTableIfMissing: true,
  });

  store.on("error", (err: Error) => {
    logger.error({ err }, "session-store error");
  });

  return session({
    name: "oasis.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store,
    cookie: {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      maxAge: SESSION_TTL_MS,
      path: "/",
    },
  });
}
