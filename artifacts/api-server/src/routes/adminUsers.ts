import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  agentPrivilegesTable,
  sessionsTable,
  type User,
  type AgentPrivileges,
} from "@workspace/db";
import {
  AdminListUsersQueryParams,
  AdminGetUserParams,
  AdminCreateStaffUserBody,
  AdminUpdateUserParams,
  AdminUpdateUserBody,
  AdminResetUserPasswordParams,
  AdminUpdateAgentPrivilegesParams,
  AdminUpdateAgentPrivilegesBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordAudit } from "../lib/audit";
import { recordHistory } from "../lib/history";
import { sendStaffWelcomeEmail } from "../lib/staffWelcomeEmail";

function userSafeSnapshot(u: User) {
  // Strip secrets so they never end up in history jsonb.
  const { passwordHash: _ph, twoFactorSecret: _tfs, ...rest } = u as User & {
    passwordHash?: string;
    twoFactorSecret?: string | null;
  };
  return rest;
}

const router: IRouter = Router();
const BCRYPT_ROUNDS = 12;

function userToSummary(row: User) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role as "customer" | "agent" | "admin",
    isActive: row.isActive,
    emailVerified: row.emailVerifiedAt !== null,
    mustChangePassword: row.mustChangePassword,
    twoFactorEnabled: row.twoFactorEnabled,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function privilegesToPayload(row: AgentPrivileges | null) {
  if (!row) return null;
  return {
    canViewAllOrders: row.canViewAllOrders,
    canViewAllCustomers: row.canViewAllCustomers,
    canViewCost: row.canViewCost,
    canAdjustInventory: row.canAdjustInventory,
    canApproveCancellations: row.canApproveCancellations,
    canSendVendorOrders: row.canSendVendorOrders,
    maxDiscountPercentage:
      row.maxDiscountPercentage === null
        ? null
        : Number(row.maxDiscountPercentage),
  };
}

function generateTempPassword(): string {
  // 12 chars from an unambiguous alphabet (no 0/O/1/l/I)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
  let out = "";
  const buf = new Uint8Array(12);
  // crypto is global in Node 20+
  crypto.getRandomValues(buf);
  for (const b of buf) out += alphabet[b % alphabet.length];
  return out;
}

router.get(
  "/admin/users",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListUsersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    // Agents may only browse customer accounts, never staff.
    const group =
      req.user?.role === "agent" ? "customers" : parsed.data.group;
    const { q } = parsed.data;
    const conditions: Array<ReturnType<typeof eq>> = [];
    if (group === "customers") {
      conditions.push(eq(usersTable.role, "customer"));
    } else if (group === "staff") {
      conditions.push(inArray(usersTable.role, ["agent", "admin"]));
    }
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      const orExpr = or(
        ilike(usersTable.email, needle),
        ilike(usersTable.firstName, needle),
        ilike(usersTable.lastName, needle),
      );
      if (orExpr) conditions.push(orExpr);
    }
    const rows = await db
      .select()
      .from(usersTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(usersTable.isActive), asc(usersTable.email));
    res.json(rows.map(userToSummary));
  },
);

router.get(
  "/admin/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [priv] = await db
      .select()
      .from(agentPrivilegesTable)
      .where(eq(agentPrivilegesTable.userId, user.id))
      .limit(1);
    res.json({
      ...userToSummary(user),
      agentPrivileges: privilegesToPayload(priv ?? null),
    });
  },
);

router.post(
  "/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateStaffUserBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    try {
      const hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
      const [row] = await db
        .insert(usersTable)
        .values({
          email: data.email.trim().toLowerCase(),
          passwordHash: hash,
          firstName: data.firstName ?? null,
          lastName: data.lastName ?? null,
          role: data.role,
          isActive: true,
          emailVerifiedAt: new Date(),
          mustChangePassword: true,
        })
        .returning();
      if (!row) {
        res.status(500).json({ error: "Failed to create user" });
        return;
      }
      if (data.role === "agent") {
        await db
          .insert(agentPrivilegesTable)
          .values({ userId: row.id })
          .onConflictDoNothing();
      }
      await recordAudit(req, {
        action: "user.create",
        entityType: "user",
        entityId: row.id,
        changes: { email: row.email, role: row.role },
      });
      await recordHistory(req, {
        entityType: "user",
        entityId: row.id,
        changeType: "create",
        snapshot: userSafeSnapshot(row),
      });

      // Fire-and-forget welcome email with login credentials.
      // Errors are caught inside the helper — a transient email failure
      // must never fail the user-creation response.
      void sendStaffWelcomeEmail({
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        temporaryPassword: data.password,
        role: row.role,
      }).catch(() => {});

      res.status(201).json(userToSummary(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res
          .status(409)
          .json({ error: "A user with that email already exists." });
        return;
      }
      throw err;
    }
  },
);

router.put(
  "/admin/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateUserBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = body.data;
    const targetId = params.data.id;
    if (req.user && req.user.id === targetId) {
      if (data.isActive === false) {
        res
          .status(400)
          .json({ error: "You cannot deactivate your own account." });
        return;
      }
      if (data.role !== undefined && data.role !== req.user.role) {
        res
          .status(400)
          .json({ error: "You cannot change your own role." });
        return;
      }
    }

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (data.firstName !== undefined) updates.firstName = data.firstName;
    if (data.lastName !== undefined) updates.lastName = data.lastName;
    if (data.role !== undefined) updates.role = data.role;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const [row] =
      Object.keys(updates).length === 0
        ? [existing]
        : await db
            .update(usersTable)
            .set(updates)
            .where(eq(usersTable.id, targetId))
            .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Auto-create privileges row when promoting to agent
    if (
      data.role === "agent" &&
      existing.role !== "agent"
    ) {
      await db
        .insert(agentPrivilegesTable)
        .values({ userId: row.id })
        .onConflictDoNothing();
    }
    if (Object.keys(updates).length > 0) {
      await recordAudit(req, {
        action: "user.update",
        entityType: "user",
        entityId: row.id,
        changes: updates,
      });
      await recordHistory(req, {
        entityType: "user",
        entityId: row.id,
        changeType: "update",
        snapshot: userSafeSnapshot(row),
        previousSnapshot: userSafeSnapshot(existing),
      });
    }
    res.json(userToSummary(row));
  },
);

router.post(
  "/admin/users/:id/reset-password",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminResetUserPasswordParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ passwordHash: hash, mustChangePassword: true })
        .where(eq(usersTable.id, user.id));
      // Invalidate all existing sessions for the target user (connect-pg-simple
      // stores session JSON in `sess` column; userId lives at sess->>'userId').
      await tx
        .delete(sessionsTable)
        .where(sql`(${sessionsTable.sess}->>'userId')::int = ${user.id}`);
    });
    await recordAudit(req, {
      action: "user.reset_password",
      entityType: "user",
      entityId: user.id,
      changes: { email: user.email },
    });
    await recordHistory(req, {
      entityType: "user",
      entityId: user.id,
      changeType: "update",
      snapshot: { ...userSafeSnapshot(user), mustChangePassword: true },
      previousSnapshot: userSafeSnapshot(user),
      notes: "admin reset password",
    });
    res.json({ temporaryPassword: tempPassword });
  },
);

router.put(
  "/admin/users/:id/agent-privileges",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateAgentPrivilegesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateAgentPrivilegesBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (user.role !== "agent") {
      res
        .status(400)
        .json({ error: "Privileges can only be set on agent users." });
      return;
    }
    const data = body.data;
    const values = {
      userId: user.id,
      canViewAllOrders: data.canViewAllOrders,
      canViewAllCustomers: data.canViewAllCustomers,
      canViewCost: data.canViewCost,
      canAdjustInventory: data.canAdjustInventory,
      canApproveCancellations: data.canApproveCancellations,
      canSendVendorOrders: data.canSendVendorOrders,
      maxDiscountPercentage:
        data.maxDiscountPercentage === null
          ? null
          : String(data.maxDiscountPercentage),
    };
    const [previous] = await db
      .select()
      .from(agentPrivilegesTable)
      .where(eq(agentPrivilegesTable.userId, user.id));
    const [row] = await db
      .insert(agentPrivilegesTable)
      .values(values)
      .onConflictDoUpdate({
        target: agentPrivilegesTable.userId,
        set: {
          canViewAllOrders: values.canViewAllOrders,
          canViewAllCustomers: values.canViewAllCustomers,
          canViewCost: values.canViewCost,
          canAdjustInventory: values.canAdjustInventory,
          canApproveCancellations: values.canApproveCancellations,
          canSendVendorOrders: values.canSendVendorOrders,
          maxDiscountPercentage: values.maxDiscountPercentage,
        },
      })
      .returning();
    await recordHistory(req, {
      entityType: "agent_privileges",
      entityId: user.id,
      changeType: "replace",
      snapshot: row,
      previousSnapshot: previous ?? null,
      notes: `agent privileges for user #${user.id}`,
    });
    res.json(privilegesToPayload(row ?? null));
  },
);

export default router;
