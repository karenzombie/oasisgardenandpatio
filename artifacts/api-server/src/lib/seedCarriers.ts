import { db, carriersTable } from "@workspace/db";
import { logger } from "./logger";

const DEFAULT_CARRIERS: Array<{
  name: string;
  code: string;
  trackingUrlTemplate: string;
}> = [
  {
    name: "UPS",
    code: "UPS",
    trackingUrlTemplate: "https://www.ups.com/track?tracknum={trackingNumber}",
  },
  {
    name: "FedEx",
    code: "FEDEX",
    trackingUrlTemplate:
      "https://www.fedex.com/fedextrack/?trknbr={trackingNumber}",
  },
  {
    name: "USPS",
    code: "USPS",
    trackingUrlTemplate:
      "https://tools.usps.com/go/TrackConfirmAction?tLabels={trackingNumber}",
  },
];

export async function seedDefaultCarriers(): Promise<void> {
  const existing = await db.select({ id: carriersTable.id }).from(carriersTable);
  if (existing.length > 0) return;

  await db.insert(carriersTable).values(
    DEFAULT_CARRIERS.map((c) => ({
      name: c.name,
      code: c.code,
      trackingUrlTemplate: c.trackingUrlTemplate,
      isActive: true,
    })),
  );
  logger.info(
    { count: DEFAULT_CARRIERS.length },
    "Seeded default carriers (UPS, FedEx, USPS)",
  );
}
