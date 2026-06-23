import {
  db,
  categoriesTable,
  materialsTable,
  legalDocumentsTable,
  siteNotificationsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";

type SeedCategory = {
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
};

const TOP_LEVEL_CATEGORIES: SeedCategory[] = [
  {
    name: "Outdoor Dining",
    slug: "outdoor-dining",
    description:
      "Dining sets, tables, and chairs designed for everyday outdoor living and weekend gatherings.",
    displayOrder: 10,
  },
  {
    name: "Outdoor Seating",
    slug: "outdoor-seating",
    description:
      "Sofas, sectionals, club chairs, and lounge chairs for relaxed afternoons on the patio.",
    displayOrder: 20,
  },
  {
    name: "Umbrellas & Shade",
    slug: "umbrellas-shade",
    description:
      "Market umbrellas, cantilever shades, and bases built to handle harsh outdoor climates.",
    displayOrder: 30,
  },
  {
    name: "Fire Pits & Heat",
    slug: "fire-pits-heat",
    description:
      "Gas fire pits, fire tables, and outdoor heaters that extend the season.",
    displayOrder: 40,
  },
  {
    name: "Cushions & Pillows",
    slug: "cushions-pillows",
    description:
      "Replacement cushions and accent pillows in Sunbrella and other premium outdoor fabrics.",
    displayOrder: 50,
  },
  {
    name: "Accessories",
    slug: "accessories",
    description:
      "Side tables, ottomans, planters, and the finishing details that complete a patio.",
    displayOrder: 60,
  },
  {
    name: "Tables",
    slug: "tables",
    description:
      "Dining tables, occasional tables, coffee tables, side tables, and table bases",
    displayOrder: 70,
  },
];

const PRIVACY_POLICY_CONTENT = `Oasis Garden & Patio Privacy Policy

Effective May 2026

Oasis Garden & Patio ("we", "us", "our") respects your privacy. This Privacy Policy explains what information we collect when you visit our website or shop with us in our Santa Clarita showroom, how we use it, and the choices you have.

1. Information We Collect
We collect information you provide directly to us — your name, email address, shipping and billing address, phone number, and order history — when you place an order, request a quote, or contact us. We also collect technical information automatically when you use our website, including IP address, browser type, pages viewed, and similar usage data.

2. How We Use Your Information
We use your information to fulfill orders and deliveries, communicate with you about your purchase, respond to inquiries, send service-related emails, improve our website and product catalog, and meet our legal and tax obligations.

3. How We Share Information
We share information only with service providers who help us operate our business — payment processors, delivery carriers, email providers, and tax service providers — and only as needed to perform their services. We do not sell your personal information.

4. Payment Security
Payment card information is processed by our PCI-compliant payment provider. We never see or store your full card number.

5. Cookies
We use cookies and similar technologies to keep you signed in, remember items in your cart, and understand how visitors use our site.

6. Your Choices
You can request a copy of the personal information we hold about you, ask us to correct it, or ask us to delete it (subject to our record-keeping obligations) by contacting sales@oasisgardenandpatio.com.

7. Contact Us
Oasis Garden & Patio
21182 Centre Pointe Pkwy #100
Santa Clarita, CA 91350
(661) 255-9909
sales@oasisgardenandpatio.com`;

const TERMS_CONTENT = `Oasis Garden & Patio Terms & Conditions

Effective May 2026

These Terms & Conditions govern your use of the Oasis Garden & Patio website and any purchase made from us, whether online, by phone, or in our Santa Clarita showroom. By using the website or placing an order, you agree to these terms.

1. Pricing & Availability
All prices are listed in U.S. dollars and are subject to change without notice. We make every effort to keep stock and pricing accurate, but availability is not guaranteed until your order is confirmed.

2. Orders
A confirmed order constitutes an agreement to purchase the listed items at the listed prices, plus applicable taxes and delivery fees. Special-order and custom items typically require a non-refundable deposit.

3. Sales Tax
Orders shipped to or picked up in California are subject to California sales tax at the applicable rate.

4. Delivery & Pickup
Local delivery is available throughout the greater Santa Clarita Valley and Los Angeles area. Delivery dates are estimates. We will contact you to schedule your delivery once your order is ready.

5. Returns
Stock items may be returned within 14 days of delivery in original condition for a refund less a restocking fee. Special-order, custom, and clearance items are final sale.

6. Warranties
Manufacturer warranties apply to all furniture, umbrellas, and accessories. Please contact us with any warranty questions and we will assist you in coordinating with the manufacturer.

7. Limitation of Liability
To the fullest extent permitted by law, Oasis Garden & Patio is not liable for indirect, incidental, or consequential damages arising from the use of our website or our products.

8. Governing Law
These terms are governed by the laws of the State of California.

9. Contact Us
Oasis Garden & Patio
21182 Centre Pointe Pkwy #100
Santa Clarita, CA 91350
(661) 255-9909
sales@oasisgardenandpatio.com`;

async function seedCategories() {
  for (const c of TOP_LEVEL_CATEGORIES) {
    await db
      .insert(categoriesTable)
      .values({
        name: c.name,
        slug: c.slug,
        description: c.description,
        displayOrder: c.displayOrder,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: categoriesTable.slug,
        set: {
          name: c.name,
          description: c.description,
          displayOrder: c.displayOrder,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Seeded ${TOP_LEVEL_CATEGORIES.length} top-level categories.`);
}

const MATERIALS: Array<{
  name: string;
  slug: string;
  description: string;
  imageUrl?: string;
  displayOrder: number;
}> = [
  {
    name: "Aluminum",
    slug: "aluminum",
    description:
      "Lightweight, weather-resistant cast and extruded aluminum frames.",
    imageUrl: "/materials/aluminum1.jpg",
    displayOrder: 1,
  },
  {
    name: "Wrought Iron",
    slug: "wrought-iron",
    description:
      "Classic, heavy-gauge wrought iron — durable and traditional.",
    imageUrl: "/materials/wroughtiron1.jpg",
    displayOrder: 2,
  },
  {
    name: "Wicker",
    slug: "wicker",
    description: "All-weather resin wicker over rust-resistant frames.",
    imageUrl: "/materials/wicker1.jpg",
    displayOrder: 3,
  },
  {
    name: "Teak",
    slug: "teak",
    description: "Sustainably sourced teak wood, naturally weather-resistant.",
    displayOrder: 4,
  },
  {
    name: "MGP",
    slug: "mgp",
    description: "Marine Grade Polymer -- strong, lightweight, splinter-free.",
    displayOrder: 5,
  },
  {
    name: "Fiberglass",
    slug: "fiberglass",
    description: "Fiberglass pole or frame construction for durability and flex.",
    displayOrder: 6,
  },
  {
    name: "Steel",
    slug: "steel",
    description: "Powder-coated or galvanized steel construction.",
    displayOrder: 7,
  },
  {
    name: "Wood",
    slug: "wood",
    description: "Hardwood or treated wood frame construction.",
    displayOrder: 8,
  },
  {
    name: "Cast Aluminum",
    slug: "cast-aluminum",
    description: "Cast aluminum -- heavier and more detailed than extruded.",
    displayOrder: 9,
  },
];

async function seedMaterials() {
  for (const m of MATERIALS) {
    await db
      .insert(materialsTable)
      .values({
        name: m.name,
        slug: m.slug,
        description: m.description,
        imageUrl: m.imageUrl ?? null,
        displayOrder: m.displayOrder,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: materialsTable.slug,
        set: {
          name: m.name,
          description: m.description,
          displayOrder: m.displayOrder,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Seeded ${MATERIALS.length} materials.`);
}

async function seedLegalDocuments() {
  const docs: Array<{
    type: "privacy_policy" | "terms_and_conditions";
    version: string;
    content: string;
    effectiveDate: string;
  }> = [
    {
      type: "privacy_policy",
      version: "2026-05-01",
      content: PRIVACY_POLICY_CONTENT,
      effectiveDate: "2026-05-01",
    },
    {
      type: "terms_and_conditions",
      version: "2026-05-01",
      content: TERMS_CONTENT,
      effectiveDate: "2026-05-01",
    },
  ];

  for (const d of docs) {
    const [existing] = await db
      .select({ id: legalDocumentsTable.id })
      .from(legalDocumentsTable)
      .where(
        sql`${legalDocumentsTable.type} = ${d.type} and ${legalDocumentsTable.version} = ${d.version}`,
      )
      .limit(1);

    if (existing) continue;

    await db.transaction(async (tx) => {
      await tx
        .update(legalDocumentsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(sql`${legalDocumentsTable.type} = ${d.type}`);
      await tx.insert(legalDocumentsTable).values({
        type: d.type,
        version: d.version,
        content: d.content,
        effectiveDate: d.effectiveDate,
        isActive: true,
      });
    });
  }
  console.log(`Seeded ${docs.length} legal documents.`);
}

async function seedSiteNotifications() {
  const [existing] = await db
    .select({ id: siteNotificationsTable.id })
    .from(siteNotificationsTable)
    .where(sql`${siteNotificationsTable.title} = 'Showroom Now Open'`)
    .limit(1);

  if (existing) {
    console.log("Welcome banner already seeded.");
    return;
  }

  await db.insert(siteNotificationsTable).values({
    title: "Showroom Now Open",
    messageText:
      "Visit our Santa Clarita showroom seven days a week to see new spring arrivals.",
    type: "banner",
    isActive: true,
    displayOrder: 0,
  });
  console.log("Seeded welcome banner.");
}

async function main() {
  console.log("Seeding Oasis Garden & Patio reference data...");
  await seedCategories();
  await seedMaterials();
  await seedLegalDocuments();
  await seedSiteNotifications();
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
