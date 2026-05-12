import { generateCustomerOrderPdf } from "./src/lib/customerOrderPdf";
import { writeFileSync } from "node:fs";

async function main() {
  const buf = await generateCustomerOrderPdf({
    orderNumber: "OG-2026-00042",
    placedAt: new Date().toISOString(),
    salespersonName: "Jane Agent",
    customerName: "John Smith",
    customerPhone: "(661) 555-0142",
    customerAddress: { street1: "123 Oak Ave", street2: null, city: "Santa Clarita", state: "CA", zip: "91350" },
    items: Array.from({ length: 25 }, (_, i) => ({
      department: "PATIO",
      description: `Sample item ${i + 1} with a moderately long description that wraps`,
      variantNameSnapshot: "Anthracite",
      fabricNameSnapshot: i % 3 === 0 ? "Sunbrella Linen Champagne" : null,
      productSkuSnapshot: `SKU-${1000 + i}`,
      variantSkuSnapshot: `SKU-${1000 + i}-AN`,
      quantity: (i % 4) + 1,
      unitPrice: 199.99,
      amount: 199.99 * ((i % 4) + 1),
      vendorName: i % 2 === 0 ? "Tropitone" : "Brown Jordan",
    })),
    subtotal: 4999.75, taxAmount: 437.48, deliveryAmount: 250, total: 5687.23, depositAmount: 2000, balanceDue: 3687.23,
    specialInstructions: "Deliver to back patio. Customer prefers morning delivery.",
    payments: Array.from({ length: 12 }, (_, i) => ({
      receivedAt: new Date(Date.now() - i * 86400000).toISOString(),
      paymentMethod: i % 3 === 0 ? "credit_card" : i % 3 === 1 ? "cash" : "check",
      status: "completed", amount: 200,
      cardLast4: i % 3 === 0 ? "4242" : null, cardType: i % 3 === 0 ? "Visa" : null, transactionId: i % 3 === 0 ? `TX-${i}` : null,
    })),
    merchandiseReceived: false, copy: "customer",
  });
  writeFileSync("/tmp/smoke-customer.pdf", buf);
  console.log("Customer PDF: " + buf.length + " bytes, " + (await import("child_process")).execSync(`pdfinfo /tmp/smoke-customer.pdf | grep Pages`).toString().trim());

  const buf2 = await generateCustomerOrderPdf({
    orderNumber: "OG-2026-00043", placedAt: new Date().toISOString(),
    salespersonName: null, customerName: null, customerPhone: null, customerAddress: null,
    items: [], subtotal: 0, taxAmount: 0, deliveryAmount: 0, total: 0, depositAmount: 0, balanceDue: 0,
    specialInstructions: null, payments: [], merchandiseReceived: true, copy: "store",
  });
  writeFileSync("/tmp/smoke-store.pdf", buf2);
  console.log("Store PDF (empty): " + buf2.length + " bytes");
}
main().catch((e) => { console.error(e); process.exit(1); });
