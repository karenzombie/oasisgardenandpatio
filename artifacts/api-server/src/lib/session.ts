import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import type { RequestHandler } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const PgStore = connectPgSimple(session);

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function buildSessionMiddleware(): RequestHandler {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  const isProd = process.env["NODE_ENV"] === "production";

  return session({
    name: "oasis.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PgStore({
      pool,
      tableName: "sessions",
      createTableIfMissing: false,
    }),
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: SESSION_TTL_MS,
      path: "/",
    },
  });
}
