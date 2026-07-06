import { Router, type IRouter, type Request, type Response } from "express";
import { randomInt, createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  customersTable,
  addressesTable,
  emailChangeTokensTable,
  ordersTable,
  orderItemsTable,
  orderItemAddonsTable,
  productsTable,
  fabricsTable,
  finishesTable,
  wishlistsTable,
  wishlistStatusHistoryTable,
} from "@workspace/db";
import {
  CreateAccountAddressBody,
  UpdateAccountProfileBody,
  UpdateAccountMarketingPreferenceBody,
  OptOutMarketingPreferenceBody,
  UpsertAccountRoleAddressBody,
  RequestAccountEmailChangeBody,
  VerifyAccountEmailChangeBody,
  ListAccountAddressesResponse,
  GetAccountProfileResponse,
  ListAccountOrdersResponse,
  GetAccountOrderResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { toPublicImageUrl } from "../lib/imageUrl";
import { sendEmailChangeCode } from "../lib/email";
import { verifyOptOutToken } from "../lib/marketingOptOutToken";

const EMAIL_CHANGE_CODE_TTL_MS = 30 * 60 * 1000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateEmailChangeCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const router: IRouter = Router();

async function getOrCreateCustomer(userId: number) {
  const [existing] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.userId, userId))
    .limit(1);
  if (existing) return existing;

  const [user] = await db
    .select()
    .from((await import("@workspace/db")).usersTable)
    .where(
      eq(
        (await import("@workspace/db")).usersTable.id,
        userId,
      ),
    )
    .limit(1);
  if (!user) throw new Error("User not found");

  const [created] = await db
    .insert(customersTable)
    .values({
      userId: user.id,
      email: user.email,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      customerType: "residential",
    })
    .returning();
  return created;
}

function serializeAddress(a: typeof addressesTable.$inferSelect) {
  return {
    id: a.id,
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
  };
}

async function loadAddresses(userId: number) {
  const customer = await getOrCreateCustomer(userId);
  const rows = await db
    .select()
    .from(addressesTable)
    .where(
      and(
        eq(addressesTable.customerId, customer.id),
        eq(addressesTable.archived, false),
      ),
    )
    .orderBy(desc(addressesTable.isDefault), desc(addressesTable.id));
  return ListAccountAddressesResponse.parse({
    addresses: rows.map(serializeAddress),
  });
}

async function isAddressReferencedByOrders(addressId: number) {
  const [referenced] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      or(
        eq(ordersTable.shippingAddressId, addressId),
        eq(ordersTable.billingAddressId, addressId),
      ),
    )
    .limit(1);
  return Boolean(referenced);
}

router.get(
  "/account/addresses",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    res.json(await loadAddresses(req.user!.id));
  },
);

router.post(
  "/account/addresses",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateAccountAddressBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const customer = await getOrCreateCustomer(req.user!.id);
    const newType = data.type ?? "shipping";

    await db.transaction(async (tx) => {
      if (data.isDefault) {
        // Defaults are per address type, so only clear the default flag on
        // other addresses of the SAME type.
        await tx
          .update(addressesTable)
          .set({ isDefault: false })
          .where(
            and(
              eq(addressesTable.customerId, customer.id),
              eq(addressesTable.type, newType),
            ),
          );
      }
      await tx.insert(addressesTable).values({
        customerId: customer.id,
        type: newType,
        recipientName: data.recipientName ?? null,
        street1: data.street1,
        street2: data.street2 ?? null,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: data.country ?? "US",
        phone: data.phone ?? null,
        isDefault: data.isDefault ?? false,
      });
    });

    res.json(await loadAddresses(req.user!.id));
  },
);

router.patch(
  "/account/addresses/:addressId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const addressId = Number(req.params.addressId);
    if (!Number.isInteger(addressId) || addressId <= 0) {
      res.status(400).json({ error: "Invalid addressId" });
      return;
    }
    const parsed = CreateAccountAddressBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const customer = await getOrCreateCustomer(req.user!.id);

    const [existing] = await db
      .select()
      .from(addressesTable)
      .where(
        and(
          eq(addressesTable.id, addressId),
          eq(addressesTable.customerId, customer.id),
          eq(addressesTable.archived, false),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    const referenced = await isAddressReferencedByOrders(addressId);
    const nextIsDefault = data.isDefault ?? existing.isDefault;
    const nextType = data.type ?? existing.type;
    const nextValues = {
      customerId: customer.id,
      type: nextType,
      recipientName: data.recipientName ?? null,
      street1: data.street1,
      street2: data.street2 ?? null,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country ?? "US",
      phone: data.phone ?? null,
      isDefault: nextIsDefault,
    };

    await db.transaction(async (tx) => {
      if (nextIsDefault) {
        // Defaults are per address type — only clear the default flag on other
        // addresses of the same type.
        await tx
          .update(addressesTable)
          .set({ isDefault: false })
          .where(
            and(
              eq(addressesTable.customerId, customer.id),
              eq(addressesTable.type, nextType),
            ),
          );
      }
      if (referenced) {
        // Clone-on-edit: keep the original row intact for order history,
        // archive it from the customer's address book, and insert a new
        // active row with the updated values.
        await tx
          .update(addressesTable)
          .set({ archived: true, isDefault: false })
          .where(eq(addressesTable.id, addressId));
        await tx.insert(addressesTable).values(nextValues);
      } else {
        await tx
          .update(addressesTable)
          .set(nextValues)
          .where(eq(addressesTable.id, addressId));
      }
    });

    res.json(await loadAddresses(req.user!.id));
  },
);

router.delete(
  "/account/addresses/:addressId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const addressId = Number(req.params.addressId);
    if (!Number.isInteger(addressId) || addressId <= 0) {
      res.status(400).json({ error: "Invalid addressId" });
      return;
    }
    const customer = await getOrCreateCustomer(req.user!.id);

    const [existing] = await db
      .select()
      .from(addressesTable)
      .where(
        and(
          eq(addressesTable.id, addressId),
          eq(addressesTable.customerId, customer.id),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    const referenced = await isAddressReferencedByOrders(addressId);
    if (referenced) {
      // Soft-delete: keep the row attached to its order(s) but hide it
      // from the customer's address book.
      await db
        .update(addressesTable)
        .set({ archived: true, isDefault: false })
        .where(eq(addressesTable.id, addressId));
    } else {
      await db
        .delete(addressesTable)
        .where(eq(addressesTable.id, addressId));
    }

    res.json(await loadAddresses(req.user!.id));
  },
);

async function loadRoleAddress(customerId: number, role: "billing" | "shipping") {
  const [a] = await db
    .select()
    .from(addressesTable)
    .where(
      and(
        eq(addressesTable.customerId, customerId),
        eq(addressesTable.type, role),
        eq(addressesTable.archived, false),
      ),
    )
    .orderBy(desc(addressesTable.isDefault), desc(addressesTable.id))
    .limit(1);
  return a ? serializeAddress(a) : null;
}

async function loadProfile(userId: number) {
  const customer = await getOrCreateCustomer(userId);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) throw new Error("User not found");

  const [pending] = await db
    .select()
    .from(emailChangeTokensTable)
    .where(
      and(
        eq(emailChangeTokensTable.userId, userId),
        isNull(emailChangeTokensTable.usedAt),
        gt(emailChangeTokensTable.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(emailChangeTokensTable.id))
    .limit(1);

  return GetAccountProfileResponse.parse({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    emailVerified: user.emailVerifiedAt != null,
    phone: customer.phone,
    pendingEmail: pending ? pending.newEmail : null,
    billingAddress: await loadRoleAddress(customer.id, "billing"),
    shippingAddress: await loadRoleAddress(customer.id, "shipping"),
    marketingOptOut: customer.marketingOptOut,
  });
}

router.get(
  "/account/profile",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    res.json(await loadProfile(req.user!.id));
  },
);

router.put(
  "/account/profile",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = UpdateAccountProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const phone =
      data.phone == null || data.phone.trim() === "" ? null : data.phone.trim();
    const customer = await getOrCreateCustomer(req.user!.id);

    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ firstName, lastName })
        .where(eq(usersTable.id, req.user!.id));
      await tx
        .update(customersTable)
        .set({ firstName, lastName, phone })
        .where(eq(customersTable.id, customer.id));
    });

    res.json(await loadProfile(req.user!.id));
  },
);

router.put(
  "/account/marketing-preference",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = UpdateAccountMarketingPreferenceBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const marketingOptOut = parsed.data.marketingOptOut;
    const customer = await getOrCreateCustomer(req.user!.id);

    await db
      .update(customersTable)
      .set({
        marketingOptOut,
        marketingOptOutAt: marketingOptOut ? new Date() : null,
      })
      .where(eq(customersTable.id, customer.id));

    // Brief 07B, Step 2B: log opt_out / opt_in. Only meaningful if this
    // customer already has a wishlist parent row (i.e. has ever saved a
    // wishlist item) — otherwise there is no wishlist to log the event
    // against, so skip silently rather than creating one.
    const [wishlistRow] = await db
      .select({ id: wishlistsTable.id })
      .from(wishlistsTable)
      .where(eq(wishlistsTable.customerId, customer.id))
      .limit(1);
    if (wishlistRow) {
      await db.insert(wishlistStatusHistoryTable).values({
        wishlistId: wishlistRow.id,
        eventType: marketingOptOut ? "opt_out" : "opt_in",
      });
    }

    res.json(await loadProfile(req.user!.id));
  },
);

// Public endpoint reached directly from the wishlist disclosure email's
// opt-out link. No auth -- the signed token itself is the credential.
router.post(
  "/account/marketing-preference/opt-out",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = OptOutMarketingPreferenceBody.safeParse(req.body);
    if (!parsed.success) {
      res.json({ status: "invalid" });
      return;
    }
    const verified = verifyOptOutToken(parsed.data.token);
    if (!verified) {
      res.json({ status: "invalid" });
      return;
    }
    await db
      .update(customersTable)
      .set({ marketingOptOut: true, marketingOptOutAt: new Date() })
      .where(eq(customersTable.id, verified.customerId));
    res.json({ status: "success" });
  },
);

router.put(
  "/account/addresses/role/:role",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const role = String(req.params.role);
    if (role !== "billing" && role !== "shipping") {
      res.status(400).json({ error: "Invalid role" });
      return;
    }
    const parsed = UpsertAccountRoleAddressBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const customer = await getOrCreateCustomer(req.user!.id);

    const nextValues = {
      customerId: customer.id,
      type: role,
      recipientName: data.recipientName ?? null,
      street1: data.street1,
      street2: data.street2 ?? null,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country ?? "US",
      phone: data.phone ?? null,
      isDefault: true,
    };

    await db.transaction(async (tx) => {
      // The role card always edits the customer's default address of this
      // type. Find the current default (if any) for this role.
      const [existing] = await tx
        .select()
        .from(addressesTable)
        .where(
          and(
            eq(addressesTable.customerId, customer.id),
            eq(addressesTable.type, role),
            eq(addressesTable.archived, false),
          ),
        )
        .orderBy(desc(addressesTable.isDefault), desc(addressesTable.id))
        .limit(1);

      // Clear the default flag on other addresses of this role so there is a
      // single default per type.
      await tx
        .update(addressesTable)
        .set({ isDefault: false })
        .where(
          and(
            eq(addressesTable.customerId, customer.id),
            eq(addressesTable.type, role),
          ),
        );

      if (!existing) {
        await tx.insert(addressesTable).values(nextValues);
        return;
      }

      const referenced = await isAddressReferencedByOrders(existing.id);
      if (referenced) {
        // Clone-on-edit: preserve the order-referenced row, archive it from the
        // address book, and insert a fresh default for this role.
        await tx
          .update(addressesTable)
          .set({ archived: true, isDefault: false })
          .where(eq(addressesTable.id, existing.id));
        await tx.insert(addressesTable).values(nextValues);
      } else {
        await tx
          .update(addressesTable)
          .set(nextValues)
          .where(eq(addressesTable.id, existing.id));
      }
    });

    res.json(await loadProfile(req.user!.id));
  },
);

router.post(
  "/account/email-change",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestAccountEmailChangeBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const newEmail = parsed.data.newEmail.trim().toLowerCase();
    const user = req.user!;
    if (newEmail === user.email.trim().toLowerCase()) {
      res
        .status(400)
        .json({ error: "That is already the email on your account." });
      return;
    }

    const [taken] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, newEmail), ne(usersTable.id, user.id)))
      .limit(1);
    if (taken) {
      res
        .status(409)
        .json({ error: "That email is already in use by another account." });
      return;
    }

    const code = generateEmailChangeCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_CODE_TTL_MS);

    await db.transaction(async (tx) => {
      // Invalidate any prior pending requests for this user.
      await tx
        .update(emailChangeTokensTable)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(emailChangeTokensTable.userId, user.id),
            isNull(emailChangeTokensTable.usedAt),
          ),
        );
      await tx.insert(emailChangeTokensTable).values({
        userId: user.id,
        newEmail,
        codeHash,
        expiresAt,
      });
    });

    await sendEmailChangeCode({
      to: newEmail,
      firstName: user.firstName,
      code,
    });

    res.json({ pendingEmail: newEmail });
  },
);

router.post(
  "/account/email-change/verify",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = VerifyAccountEmailChangeBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const user = req.user!;
    const codeHash = hashCode(parsed.data.code.trim());

    const [token] = await db
      .select()
      .from(emailChangeTokensTable)
      .where(
        and(
          eq(emailChangeTokensTable.userId, user.id),
          isNull(emailChangeTokensTable.usedAt),
          gt(emailChangeTokensTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(emailChangeTokensTable.id))
      .limit(1);

    if (!token || token.codeHash !== codeHash) {
      res
        .status(400)
        .json({ error: "That code is invalid or has expired." });
      return;
    }

    // Re-check uniqueness at verify time in case the email was claimed between
    // request and verification.
    const newEmail = token.newEmail.trim().toLowerCase();
    const [taken] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, newEmail), ne(usersTable.id, user.id)))
      .limit(1);
    if (taken) {
      res
        .status(409)
        .json({ error: "That email is already in use by another account." });
      return;
    }

    const customer = await getOrCreateCustomer(user.id);
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ email: newEmail, emailVerifiedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      await tx
        .update(customersTable)
        .set({ email: newEmail })
        .where(eq(customersTable.id, customer.id));
      await tx
        .update(emailChangeTokensTable)
        .set({ usedAt: new Date() })
        .where(eq(emailChangeTokensTable.id, token.id));
    });

    res.json(await loadProfile(user.id));
  },
);

router.delete(
  "/account/email-change",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    await db
      .update(emailChangeTokensTable)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailChangeTokensTable.userId, req.user!.id),
          isNull(emailChangeTokensTable.usedAt),
        ),
      );
    res.json(await loadProfile(req.user!.id));
  },
);

router.get(
  "/account/orders",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const customer = await getOrCreateCustomer(req.user!.id);
    const rows = await db
      .select({
        orderNumber: ordersTable.orderNumber,
        placedAt: ordersTable.placedAt,
        status: ordersTable.status,
        total: ordersTable.total,
        itemCount: sql<number>`(
          select coalesce(sum(${orderItemsTable.quantity}), 0)::int
          from ${orderItemsTable}
          where ${orderItemsTable.orderId} = ${ordersTable.id}
        )`,
      })
      .from(ordersTable)
      .where(eq(ordersTable.customerId, customer.id))
      .orderBy(desc(ordersTable.placedAt));

    res.json(
      ListAccountOrdersResponse.parse({
        orders: rows.map((r) => ({
          orderNumber: r.orderNumber,
          placedAt:
            r.placedAt instanceof Date
              ? r.placedAt.toISOString()
              : String(r.placedAt),
          status: r.status,
          total: String(r.total),
          itemCount: r.itemCount,
        })),
      }),
    );
  },
);

router.get(
  "/account/orders/:orderNumber",
  async (req: Request, res: Response): Promise<void> => {
    const orderNumber = String(req.params.orderNumber);
    // Authenticated customers can fetch any of their own orders. Guests can
    // only fetch orders that the current session itself just placed (recorded
    // in `req.session.guestOrders` by /checkout). This is what powers the
    // post-checkout confirmation page for guests.
    const guestOrderNumbers = req.session.guestOrders ?? [];
    const isGuestSelfFetch =
      !req.session.userId && guestOrderNumbers.includes(orderNumber);
    if (!req.session.userId && !isGuestSelfFetch) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const orderWhere = req.session.userId
      ? and(
          eq(ordersTable.orderNumber, orderNumber),
          eq(
            ordersTable.customerId,
            (await getOrCreateCustomer(req.session.userId)).id,
          ),
        )
      : eq(ordersTable.orderNumber, orderNumber);
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(orderWhere)
      .limit(1);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const items = await db
      .select({
        id: orderItemsTable.id,
        productId: orderItemsTable.productId,
        slug: productsTable.slug,
        description: orderItemsTable.description,
        productSku: orderItemsTable.productSkuSnapshot,
        unitPrice: orderItemsTable.unitPrice,
        quantity: orderItemsTable.quantity,
        amount: orderItemsTable.amount,
        finishName: orderItemsTable.variantNameSnapshot,
        finialName: orderItemsTable.finialNameSnapshot,
        fabricName: orderItemsTable.fabricNameSnapshot,
        fabricItemNumber: orderItemsTable.fabricItemNumberSnapshot,
        swatchImageUrl: fabricsTable.swatchImageUrl,
        manufacturerId: productsTable.manufacturerId,
      })
      .from(orderItemsTable)
      .leftJoin(
        productsTable,
        eq(productsTable.id, orderItemsTable.productId),
      )
      .leftJoin(fabricsTable, eq(fabricsTable.id, orderItemsTable.fabricId))
      .where(eq(orderItemsTable.orderId, order.id))
      .orderBy(orderItemsTable.id);

    // Add-on snapshots attached to each order line (immutable at purchase time).
    const orderItemIds = items.map((i) => i.id);
    const addonRows = orderItemIds.length
      ? await db
          .select({
            orderItemId: orderItemAddonsTable.orderItemId,
            sku: orderItemAddonsTable.addonSkuSnapshot,
            name: orderItemAddonsTable.addonNameSnapshot,
            grade: orderItemAddonsTable.gradeSnapshot,
            unitPrice: orderItemAddonsTable.unitPriceSnapshot,
            quantity: orderItemAddonsTable.quantity,
            amount: orderItemAddonsTable.amount,
          })
          .from(orderItemAddonsTable)
          .where(inArray(orderItemAddonsTable.orderItemId, orderItemIds))
          .orderBy(asc(orderItemAddonsTable.id))
      : [];
    const addonsByOrderItem = new Map<
      number,
      {
        sku: string;
        name: string;
        grade: string | null;
        unitPrice: string;
        quantity: number;
        amount: string;
      }[]
    >();
    for (const a of addonRows) {
      const list = addonsByOrderItem.get(a.orderItemId) ?? [];
      list.push({
        sku: a.sku,
        name: a.name,
        grade: a.grade ?? null,
        unitPrice: String(a.unitPrice),
        quantity: a.quantity,
        amount: String(a.amount),
      });
      addonsByOrderItem.set(a.orderItemId, list);
    }

    // Resolve finish swatch images. Finishes are a separate catalog entity; the
    // order item only snapshots the finish name, so match by manufacturer + name
    // (case-insensitive). Build one lookup keyed by "manufacturerId::lowername".
    const finishKeys = items
      .filter((i) => i.manufacturerId != null && i.finishName)
      .map((i) => ({ mfr: i.manufacturerId as number, name: i.finishName as string }));
    const finishSwatchByKey = new Map<string, string>();
    if (finishKeys.length > 0) {
      const mfrIds = Array.from(new Set(finishKeys.map((k) => k.mfr)));
      const finishRows = await db
        .select({
          manufacturerId: finishesTable.manufacturerId,
          name: finishesTable.name,
          imageUrl: finishesTable.imageUrl,
        })
        .from(finishesTable)
        .where(
          and(
            inArray(finishesTable.manufacturerId, mfrIds),
            eq(finishesTable.isActive, true),
          ),
        )
        .orderBy(asc(finishesTable.displayOrder), asc(finishesTable.id));
      for (const f of finishRows) {
        if (!f.imageUrl) continue;
        const key = `${f.manufacturerId}::${f.name.trim().toLowerCase()}`;
        if (!finishSwatchByKey.has(key)) finishSwatchByKey.set(key, f.imageUrl);
      }
    }
    const finishSwatchFor = (
      mfr: number | null,
      name: string | null,
    ): string | null =>
      mfr != null && name
        ? finishSwatchByKey.get(`${mfr}::${name.trim().toLowerCase()}`) ?? null
        : null;

    let shippingAddress = null;
    if (order.shippingAddressId) {
      const [a] = await db
        .select()
        .from(addressesTable)
        .where(eq(addressesTable.id, order.shippingAddressId))
        .limit(1);
      if (a) shippingAddress = serializeAddress(a);
    }
    let billingAddress = null;
    if (order.billingAddressId) {
      const [a] = await db
        .select()
        .from(addressesTable)
        .where(eq(addressesTable.id, order.billingAddressId))
        .limit(1);
      if (a) billingAddress = serializeAddress(a);
    }

    res.json(
      GetAccountOrderResponse.parse({
        orderNumber: order.orderNumber,
        placedAt:
          order.placedAt instanceof Date
            ? order.placedAt.toISOString()
            : String(order.placedAt),
        status: order.status,
        subtotal: String(order.subtotal),
        deliveryAmount: String(order.deliveryAmount),
        taxAmount: String(order.taxAmount),
        total: String(order.total),
        shippingMethod: order.shippingMethod,
        specialInstructions: order.specialInstructions,
        shippingAddress,
        billingAddress,
        items: items.map((i) => ({
          id: i.id,
          productId: i.productId,
          slug: i.slug,
          description: i.description,
          productSku: i.productSku,
          unitPrice: String(i.unitPrice),
          quantity: i.quantity,
          amount: String(i.amount),
          finishName: i.finishName,
          finialName: i.finialName,
          fabricName: i.fabricName,
          fabricItemNumber: i.fabricItemNumber,
          swatchImageUrl: toPublicImageUrl(i.swatchImageUrl),
          finishSwatchImageUrl: toPublicImageUrl(
            finishSwatchFor(i.manufacturerId, i.finishName),
          ),
          addons: addonsByOrderItem.get(i.id) ?? [],
        })),
      }),
    );
  },
);

export default router;
export { getOrCreateCustomer };
