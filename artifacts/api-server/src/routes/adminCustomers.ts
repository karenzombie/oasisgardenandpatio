import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  db,
  customersTable,
  addressesTable,
  usersTable,
  passwordResetTokensTable,
  type Customer,
  type Address,
} from "@workspace/db";
import { sendPasswordResetEmail } from "../lib/email";
import {
  AdminListCustomersQueryParams,
  AdminGetCustomerParams,
  AdminCreateCustomerBody,
  AdminUpdateCustomerParams,
  AdminUpdateCustomerBody,
  AdminCreateCustomerAddressParams,
  AdminCreateCustomerAddressBody,
  AdminUpdateCustomerAddressParams,
  AdminUpdateCustomerAddressBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordAudit } from "../lib/audit";
import { recordHistory } from "../lib/history";
import { isUSCountry, US_ONLY_MESSAGE } from "../lib/geo";

const router: IRouter = Router();

const INVITE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const BCRYPT_ROUNDS = 12;

function publicBaseUrl(req: Request): string {
  const proto = (req.get("x-forwarded-proto") ?? req.protocol ?? "https")
    .split(",")[0]
    .trim();
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  return `${proto}://${host}`;
}

function customerToPayload(c: Customer) {
  return {
    id: c.id,
    userId: c.userId,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    companyName: c.companyName,
    customerType: c.customerType,
    createdByAgentId: c.createdByAgentId,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function addressToPayload(a: Address) {
  return {
    id: a.id,
    customerId: a.customerId,
    type: a.type,
    recipientName: a.recipientName,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    phone: a.phone,
    isDefault: a.isDefault,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// RBAC policy for /admin/customers: ALL staff (admin + agent) can read/write
// every customer record. This is intentional — agents must be able to look up
// and service walk-in customers regardless of which agent originally created
// the record. Per-agent attribution is preserved via `createdByAgentId` for
// reporting (sales-by-agent), but customer access itself is not self-scoped.
router.get(
  "/admin/customers",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListCustomersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const { q, limit = 50, offset = 0 } = parsed.data;
    const conds = [];
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      const orExpr = or(
        ilike(customersTable.email, needle),
        ilike(customersTable.firstName, needle),
        ilike(customersTable.lastName, needle),
        ilike(customersTable.phone, needle),
        ilike(customersTable.companyName, needle),
      );
      if (orExpr) conds.push(orExpr);
    }
    const where = conds.length ? and(...conds) : undefined;
    const rows = await db
      .select()
      .from(customersTable)
      .where(where)
      .orderBy(desc(customersTable.createdAt))
      .limit(Math.min(limit, 200))
      .offset(offset);
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customersTable)
      .where(where);
    res.json({
      rows: rows.map(customerToPayload),
      total: countRow?.count ?? 0,
    });
  },
);

router.get(
  "/admin/customers/:id",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetCustomerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [c] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, params.data.id))
      .limit(1);
    if (!c) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const addresses = await db
      .select()
      .from(addressesTable)
      .where(eq(addressesTable.customerId, c.id))
      .orderBy(desc(addressesTable.isDefault), asc(addressesTable.id));
    res.json({
      ...customerToPayload(c),
      addresses: addresses.map(addressToPayload),
    });
  },
);

router.post(
  "/admin/customers",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateCustomerBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const email = data.email.trim().toLowerCase();
    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const sendInvite = data.sendInvite ?? false;
    try {
      const result = await db.transaction(async (tx) => {
        const [createdRow] = await tx
          .insert(customersTable)
          .values({
            email,
            firstName,
            lastName,
            phone: data.phone?.trim() || null,
            companyName: data.companyName?.trim() || null,
            customerType: data.customerType ?? "residential",
            notes: data.notes?.trim() || null,
            createdByAgentId: req.user?.id ?? null,
          })
          .returning();
        if (!createdRow) {
          throw new Error("Insert returned no row");
        }

        let invitedUserId: number | null = null;
        let inviteRawToken: string | null = null;
        if (sendInvite) {
          // If a user already exists for this email, link to it; otherwise
          // create a pending customer user. The customer record gets userId.
          const [existingUser] = await tx
            .select()
            .from(usersTable)
            .where(eq(usersTable.email, email))
            .limit(1);
          let userId: number;
          if (existingUser) {
            // Only customer-role users may be linked via this flow. Refuse to
            // mint a password-reset token against a staff/admin/agent account.
            if (existingUser.role !== "customer") {
              const e = new Error(
                "An account with this email already exists and is not a customer account.",
              );
              (e as Error & { httpStatus?: number }).httpStatus = 409;
              throw e;
            }
            userId = existingUser.id;
          } else {
            // Create a pending account with a random unguessable password —
            // the invitee will set their own via the reset link.
            const randomPassword = randomBytes(32).toString("hex");
            const passwordHash = await bcrypt.hash(
              randomPassword,
              BCRYPT_ROUNDS,
            );
            const [newUser] = await tx
              .insert(usersTable)
              .values({
                email,
                passwordHash,
                firstName,
                lastName,
                role: "customer",
                isActive: true,
                emailVerifiedAt: null,
              })
              .returning();
            if (!newUser) {
              throw new Error("User insert returned no row");
            }
            userId = newUser.id;
          }
          // Link customer -> user
          await tx
            .update(customersTable)
            .set({ userId })
            .where(eq(customersTable.id, createdRow.id));
          // Issue invite token (mirrors password-reset flow).
          inviteRawToken = randomBytes(32).toString("hex");
          const tokenHash = createHash("sha256")
            .update(inviteRawToken)
            .digest("hex");
          const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);
          await tx.insert(passwordResetTokensTable).values({
            userId,
            tokenHash,
            expiresAt,
          });
          invitedUserId = userId;
        }

        return { createdRow, invitedUserId, inviteRawToken };
      });

      const created =
        result.invitedUserId !== null
          ? { ...result.createdRow, userId: result.invitedUserId }
          : result.createdRow;

      let inviteSent: boolean | null = null;
      if (sendInvite && result.inviteRawToken) {
        const resetUrl = `${publicBaseUrl(req)}/reset-password?token=${encodeURIComponent(result.inviteRawToken)}`;
        try {
          await sendPasswordResetEmail({
            to: email,
            firstName,
            resetUrl,
          });
          inviteSent = true;
        } catch (mailErr) {
          inviteSent = false;
          req.log?.warn?.(
            { err: mailErr, customerId: created.id },
            "Failed to send customer invite email",
          );
        }
      }

      await recordAudit(req, {
        action: "customer.create",
        entityType: "customer",
        entityId: created.id,
        changes: { email: created.email, sendInvite },
      });
      await recordHistory(req, {
        entityType: "customer",
        entityId: created.id,
        changeType: "create",
        snapshot: created,
      });
      res
        .status(201)
        .json({ ...customerToPayload(created), inviteSent });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Customer already exists" });
        return;
      }
      const httpStatus = (err as { httpStatus?: number } | null)?.httpStatus;
      if (httpStatus === 409 && err instanceof Error) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  },
);

router.patch(
  "/admin/customers/:id",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateCustomerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateCustomerBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = body.data;
    const updates: Record<string, unknown> = {};
    if (data.email !== undefined) updates.email = data.email.trim().toLowerCase();
    if (data.firstName !== undefined) updates.firstName = data.firstName.trim();
    if (data.lastName !== undefined) updates.lastName = data.lastName.trim();
    if (data.phone !== undefined) updates.phone = data.phone?.trim() || null;
    if (data.companyName !== undefined)
      updates.companyName = data.companyName?.trim() || null;
    if (data.customerType !== undefined)
      updates.customerType = data.customerType;
    if (data.notes !== undefined) updates.notes = data.notes?.trim() || null;
    if (Object.keys(updates).length === 0) {
      const [existing] = await db
        .select()
        .from(customersTable)
        .where(eq(customersTable.id, params.data.id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(customerToPayload(existing));
      return;
    }
    const [previous] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, params.data.id));
    const [updated] = await db
      .update(customersTable)
      .set(updates)
      .where(eq(customersTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await recordAudit(req, {
      action: "customer.update",
      entityType: "customer",
      entityId: updated.id,
      changes: updates,
    });
    await recordHistory(req, {
      entityType: "customer",
      entityId: updated.id,
      changeType: "update",
      snapshot: updated,
      previousSnapshot: previous ?? null,
    });
    res.json(customerToPayload(updated));
  },
);

// ─── Addresses ────────────────────────────────────────────────────────────

router.post(
  "/admin/customers/:id/addresses",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminCreateCustomerAddressParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminCreateCustomerAddressBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = body.data;
    const customerId = params.data.id;
    // US-only ship-to policy. Empty/omitted country defaults to "US".
    if (data.country !== undefined && data.country !== null && data.country.trim() !== "" && !isUSCountry(data.country)) {
      res.status(400).json({ error: US_ONLY_MESSAGE });
      return;
    }
    const [exists] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.id, customerId))
      .limit(1);
    if (!exists) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    const [created] = await db
      .insert(addressesTable)
      .values({
        customerId,
        type: data.type ?? "shipping",
        recipientName: data.recipientName?.trim() || null,
        street1: data.street1.trim(),
        street2: data.street2?.trim() || null,
        city: data.city.trim(),
        state: data.state.trim(),
        zip: data.zip.trim(),
        country: "US",
        phone: data.phone?.trim() || null,
        isDefault: data.isDefault ?? false,
      })
      .returning();
    if (!created) {
      res.status(500).json({ error: "Insert returned no row" });
      return;
    }
    await recordHistory(req, {
      entityType: "customer_address",
      entityId: created.id,
      changeType: "create",
      snapshot: created,
      notes: `customer #${customerId}`,
    });
    res.status(201).json(addressToPayload(created));
  },
);

router.patch(
  "/admin/customers/:id/addresses/:addressId",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateCustomerAddressParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateCustomerAddressBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = body.data;
    // US-only ship-to policy. Reject any non-US country update.
    if (data.country !== undefined && data.country !== null && data.country.trim() !== "" && !isUSCountry(data.country)) {
      res.status(400).json({ error: US_ONLY_MESSAGE });
      return;
    }
    const updates: Record<string, unknown> = {};
    for (const k of [
      "type",
      "recipientName",
      "street1",
      "street2",
      "city",
      "state",
      "zip",
      "country",
      "phone",
      "isDefault",
    ] as const) {
      if (data[k] !== undefined) {
        const v = data[k];
        if (k === "country") {
          updates[k] = "US";
        } else {
          updates[k] = typeof v === "string" ? (v.trim() || null) : v;
        }
      }
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields provided" });
      return;
    }
    const [previous] = await db
      .select()
      .from(addressesTable)
      .where(
        and(
          eq(addressesTable.id, params.data.addressId),
          eq(addressesTable.customerId, params.data.id),
        ),
      );
    const [updated] = await db
      .update(addressesTable)
      .set(updates)
      .where(
        and(
          eq(addressesTable.id, params.data.addressId),
          eq(addressesTable.customerId, params.data.id),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "customer_address",
      entityId: updated.id,
      changeType: "update",
      snapshot: updated,
      previousSnapshot: previous ?? null,
      notes: `customer #${params.data.id}`,
    });
    res.json(addressToPayload(updated));
  },
);

export default router;
