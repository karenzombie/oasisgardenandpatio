import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";

const BCRYPT_ROUNDS = 12;

export async function seedSuperAdmin(): Promise<void> {
  const email = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
  const password = process.env["ADMIN_INITIAL_PASSWORD"];

  if (!email || !password) {
    logger.info(
      "ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD not set — skipping admin seed",
    );
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing) {
    if (existing.role !== "admin") {
      await db
        .update(usersTable)
        .set({ role: "admin", isActive: true })
        .where(eq(usersTable.id, existing.id));
      logger.info(
        { userId: existing.id, email },
        "Promoted existing user to admin via ADMIN_EMAIL",
      );
    } else {
      logger.info(
        { userId: existing.id, email },
        "Super admin already exists — no seed needed",
      );
    }
    return;
  }

  if (password.length < 12) {
    logger.warn(
      "ADMIN_INITIAL_PASSWORD is shorter than 12 chars — please use a strong password",
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [created] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      firstName: "Super",
      lastName: "Admin",
      role: "admin",
      isActive: true,
      emailVerifiedAt: new Date(),
      mustChangePassword: true,
    })
    .returning({ id: usersTable.id });

  logger.info(
    { userId: created?.id, email },
    "Seeded initial super admin (must change password on first login)",
  );
}
