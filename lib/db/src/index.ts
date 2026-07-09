import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const LOCAL_DB_HOSTS = new Set(["helium", "localhost", "127.0.0.1", "::1", "[::1]"]);

// True only in an actual Replit deployment (published app), where connecting
// to the remote production database is legitimate. NODE_ENV is NOT used here:
// it is too easy to set NODE_ENV=production in a local shell and silently
// bypass the guard.
const IS_DEPLOYMENT = process.env.REPLIT_DEPLOYMENT === "1";

function describeTarget(connectionString: string): {
  host: string;
  database: string;
  isLocal: boolean;
} {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      "[db guard] DATABASE_URL is not a parseable URL. Use the standard form postgresql://user:pass@host:port/dbname so the guard can verify the target host.",
    );
  }
  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//, "").split("?")[0] || "(unknown)";
  return { host, database, isLocal: LOCAL_DB_HOSTS.has(host) };
}

const target = describeTarget(process.env.DATABASE_URL);

if (!target.isLocal && !IS_DEPLOYMENT && process.env.ALLOW_PROD !== "1") {
  throw new Error(
    `[db guard] Refusing to connect to REMOTE database "${target.database}" on host "${target.host}" from a non-deployment environment. ` +
      `This is probably the live production database. If this is intentional, re-run with ALLOW_PROD=1 set in the shell environment.`,
  );
}

if (!IS_DEPLOYMENT) {
  process.stderr.write(
    `[db guard] Connected target: ${target.database} @ ${target.host} ` +
      `${target.isLocal ? "(local dev)" : "(REMOTE — ALLOW_PROD acknowledged)"}\n`,
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./pricing";
