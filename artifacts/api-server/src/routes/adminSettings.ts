import { Router, type IRouter, type Request, type Response } from "express";
import { inArray } from "drizzle-orm";
import { db, systemSettingsTable, SETTING_KEYS } from "@workspace/db";
import {
  AdminUpdateSettingsBody,
  AdminGetSettingsResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { SETTING_DEFAULTS } from "../lib/seedSettings";
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();

type Settings = ReturnType<typeof AdminGetSettingsResponse.parse>;

const KEY_MAP: Record<keyof Settings, string> = {
  defaultTaxRate: SETTING_KEYS.defaultTaxRate,
  shippingMode: SETTING_KEYS.shippingMode,
  flatShippingRate: SETTING_KEYS.flatShippingRate,
  shippingPercentage: SETTING_KEYS.shippingPercentage,
  freeShippingThreshold: SETTING_KEYS.freeShippingThreshold,
  overdueVendorOrderThresholdDays:
    SETTING_KEYS.overdueVendorOrderThresholdDays,
  lowStockThreshold: SETTING_KEYS.lowStockThreshold,
  defaultAgentDiscountCap: SETTING_KEYS.defaultAgentDiscountCap,
  currentSequenceYear: SETTING_KEYS.currentSequenceYear,
  currentYearOrderSequence: SETTING_KEYS.currentYearOrderSequence,
};

const REVERSE_KEY_MAP: Record<string, keyof Settings> = Object.fromEntries(
  Object.entries(KEY_MAP).map(([k, v]) => [v, k as keyof Settings]),
) as Record<string, keyof Settings>;

async function readAllSettings(): Promise<Settings> {
  const rows = await db
    .select({
      key: systemSettingsTable.key,
      value: systemSettingsTable.value,
    })
    .from(systemSettingsTable)
    .where(inArray(systemSettingsTable.key, Object.values(KEY_MAP)));
  const found = new Map<string, unknown>();
  for (const r of rows) found.set(r.key, r.value);
  const out: Record<string, unknown> = {};
  for (const [apiKey, dbKey] of Object.entries(KEY_MAP)) {
    out[apiKey] = found.has(dbKey)
      ? found.get(dbKey)
      : SETTING_DEFAULTS[dbKey]?.value;
  }
  return out as Settings;
}

router.get(
  "/admin/settings",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const settings = await readAllSettings();
    res.json(settings);
  },
);

router.put(
  "/admin/settings",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const body = AdminUpdateSettingsBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const entries = Object.entries(body.data) as Array<
      [keyof Settings, unknown]
    >;
    if (entries.length === 0) {
      const settings = await readAllSettings();
      res.json(settings);
      return;
    }
    try {
      await db.transaction(async (tx) => {
        for (const [apiKey, value] of entries) {
          if (value === undefined) continue;
          const dbKey = KEY_MAP[apiKey];
          const description = SETTING_DEFAULTS[dbKey]?.description ?? null;
          await tx
            .insert(systemSettingsTable)
            .values({ key: dbKey, value: value as unknown, description })
            .onConflictDoUpdate({
              target: systemSettingsTable.key,
              set: { value: value as unknown },
            });
        }
      });
      const settings = await readAllSettings();
      await recordAudit(req, {
        action: "settings.update",
        entityType: "settings",
        entityId: null,
        changes: body.data,
      });
      res.json(settings);
    } catch (err) {
      req.log.error({ err }, "Failed to update settings");
      res.status(500).json({ error: "Failed to update settings" });
    }
  },
);

export { router as adminSettingsRouter, REVERSE_KEY_MAP };
export default router;
