import { Router, type Request, type Response } from "express";
import { spawn } from "child_process";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { mkdir, writeFile, rm, stat } from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { desc } from "drizzle-orm";
import { db, backupLogTable, type BackupLog } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const exec = promisify(execCb);
const router = Router();

const GITHUB_OWNER = "karenzombie";
const GITHUB_REPO = "oasis-db-backups";
const BRANCH = "main";

function maskToken(str: string, token: string): string {
  if (!token) return str;
  return str.split(token).join("***");
}

function pgDump(databaseUrl: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pg_dump", [databaseUrl], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const outStream = createWriteStream(outputPath);
    proc.stdout.pipe(outStream);

    let stderrData = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("pg_dump timed out after 5 minutes"));
    }, 5 * 60 * 1000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `pg_dump exited with code ${code}: ${stderrData.slice(0, 500)}`,
          ),
        );
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runBackupJob(
  backupType: "products" | "customers",
  triggeredBy: string,
): Promise<BackupLog> {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  if (!token) throw new Error("GITHUB_BACKUP_TOKEN environment variable is not set");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is not set");

  const tempId = randomUUID();
  const cloneDir = path.join("/tmp", `oasis-backup-${tempId}`);
  const repoUrl = `https://${token}@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git`;
  const subDir = backupType === "products" ? "latest-products" : "latest-customers";

  const ranAt = new Date();
  let databaseDumpSizeBytes: number | null = null;

  try {
    // 1. Clone the repo — fall back to git init for empty repos
    try {
      await exec(`git clone --depth 1 "${repoUrl}" "${cloneDir}"`, {
        timeout: 60_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch {
      await exec(`git init "${cloneDir}"`, { timeout: 10_000 });
      await exec(`git -C "${cloneDir}" remote add origin "${repoUrl}"`, {
        timeout: 10_000,
      });
    }

    // 2. Set git identity per-repo (no global config mutation)
    await exec(
      `git -C "${cloneDir}" config user.email "backup@oasis.internal"`,
      { timeout: 10_000 },
    );
    await exec(
      `git -C "${cloneDir}" config user.name "Oasis Backup System"`,
      { timeout: 10_000 },
    );

    // 3. Prepare target subfolder
    const targetDir = path.join(cloneDir, subDir);
    await mkdir(targetDir, { recursive: true });

    // 4. Stream pg_dump directly to database.sql
    const sqlPath = path.join(targetDir, "database.sql");
    await pgDump(databaseUrl, sqlPath);
    const { size } = await stat(sqlPath);
    databaseDumpSizeBytes = size;

    // 5. Write manifest
    const manifest: Record<string, unknown> = {
      backup_type: backupType,
      timestamp: ranAt.toISOString(),
      triggered_by: triggeredBy,
      database_dump_size_bytes: databaseDumpSizeBytes,
      status: "success",
    };
    if (backupType === "products") {
      manifest.images_location = "Replit Object Storage /objects/";
    }
    await writeFile(
      path.join(targetDir, "backup-manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );

    // 6. Commit and force-push
    await exec(`git -C "${cloneDir}" add -A`, { timeout: 10_000 });
    await exec(
      `git -C "${cloneDir}" commit -m "backup: ${backupType} ${ranAt.toISOString()}"`,
      { timeout: 15_000 },
    );
    await exec(
      `git -C "${cloneDir}" push --force origin HEAD:${BRANCH}`,
      {
        timeout: 5 * 60_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
    );

    // 7. Log success
    const [row] = await db
      .insert(backupLogTable)
      .values({
        backupType,
        ranAt,
        triggeredBy,
        status: "success",
        errorMessage: null,
        databaseDumpSizeBytes,
        imageCount: null,
      })
      .returning();

    return row;
  } catch (err) {
    const rawMessage =
      err instanceof Error ? err.message : String(err);
    const errorMessage = maskToken(rawMessage, token);

    const [row] = await db
      .insert(backupLogTable)
      .values({
        backupType,
        ranAt,
        triggeredBy,
        status: "failure",
        errorMessage,
        databaseDumpSizeBytes,
        imageCount: null,
      })
      .returning();

    const wrappedErr = new Error(errorMessage) as Error & { logRow: BackupLog };
    wrappedErr.logRow = row;
    throw wrappedErr;
  } finally {
    await rm(cloneDir, { recursive: true, force: true });
  }
}

function toPayload(row: BackupLog) {
  return {
    id: row.id,
    backupType: row.backupType,
    ranAt: row.ranAt.toISOString(),
    triggeredBy: row.triggeredBy ?? null,
    status: row.status,
    errorMessage: row.errorMessage ?? null,
    databaseDumpSizeBytes: row.databaseDumpSizeBytes ?? null,
    imageCount: row.imageCount ?? null,
  };
}

router.post(
  "/admin/backup/products",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);
    try {
      const row = await runBackupJob("products", req.user!.email);
      res.json(toPayload(row));
    } catch (err: unknown) {
      const typed = err as { logRow?: BackupLog; message?: string };
      res.status(503).json({
        error: typed.message ?? "Backup failed",
        log: typed.logRow ? toPayload(typed.logRow) : null,
      });
    }
  },
);

router.post(
  "/admin/backup/customers",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);
    try {
      const row = await runBackupJob("customers", req.user!.email);
      res.json(toPayload(row));
    } catch (err: unknown) {
      const typed = err as { logRow?: BackupLog; message?: string };
      res.status(503).json({
        error: typed.message ?? "Backup failed",
        log: typed.logRow ? toPayload(typed.logRow) : null,
      });
    }
  },
);

router.get(
  "/admin/backup/log",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(backupLogTable)
      .orderBy(desc(backupLogTable.ranAt))
      .limit(50);
    res.json({
      items: rows.map(toPayload),
      total: rows.length,
    });
  },
);

export default router;
