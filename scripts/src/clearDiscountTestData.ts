import { db, couponCodeUsesTable, couponCodesTable, discountEventsTable } from "@workspace/db";

async function clearDiscountTestData() {
  console.log("Deleting coupon_code_uses...");
  const usesResult = await db.delete(couponCodeUsesTable).returning({ id: couponCodeUsesTable.id });
  console.log(`  Deleted ${usesResult.length} coupon_code_uses rows`);

  console.log("Deleting coupon_codes...");
  const couponsResult = await db.delete(couponCodesTable).returning({ id: couponCodesTable.id });
  console.log(`  Deleted ${couponsResult.length} coupon_codes rows`);

  console.log("Deleting discount_events...");
  const eventsResult = await db.delete(discountEventsTable).returning({ id: discountEventsTable.id });
  console.log(`  Deleted ${eventsResult.length} discount_events rows`);

  console.log("Done — all discount test data cleared.");
}

clearDiscountTestData().catch((err) => {
  console.error(err);
  process.exit(1);
});
