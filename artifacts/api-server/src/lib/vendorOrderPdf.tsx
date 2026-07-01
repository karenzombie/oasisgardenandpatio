import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { OASIS_LOGO_DATA_URL } from "./oasisLogoData";

const OASIS_NAME = "Oasis Garden & Patio";
const OASIS_ADDR1 = "21182 Centre Pointe Parkway #100";
const OASIS_ADDR2 = "Santa Clarita, CA 91350";
const OASIS_PHONE = "(661) 255-9909";
const OASIS_FAX = "(661) 255-9915";
const OASIS_EMAIL = "sales@oasisgardenandpatio.com";

// Logo is inlined as a base64 data URL (see ./oasisLogoData.ts) so the PNG
// survives the esbuild bundle into a single-file dist — esbuild doesn't
// copy the src/assets dir.
const LOGO_SRC = OASIS_LOGO_DATA_URL;

const BORDER = "#888";
const HEADER_BG = "#1a1a1a";
const LIGHT_BG = "#f7f7f5";
const SECTION_LABEL = "#555";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    padding: 24,
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row" },

  /* ── Top header ───────────────────────────────────────────────── */
  headerLeft: { width: "38%", paddingRight: 12 },
  headerRight: { width: "62%" },

  brandLogo: {
    width: 160,
    height: 72,
    objectFit: "contain",
    marginBottom: 6,
  },
  poTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    borderBottom: `2px solid ${HEADER_BG}`,
    paddingBottom: 4,
    marginBottom: 6,
    textAlign: "center",
  },

  /* ── Note to Vendor banner (top of doc, bold all-caps) ────────── */
  noteToVendorBanner: {
    border: `1.5px solid ${HEADER_BG}`,
    backgroundColor: "#fff8e1",
    padding: "6px 8px",
    marginBottom: 8,
  },
  noteToVendorText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    lineHeight: 1.3,
  },

  /* ── Correction banner (resend only, very top, bold all-caps) ──── */
  correctionBanner: {
    border: "1.5px solid #b91c1c",
    backgroundColor: "#fee2e2",
    padding: "6px 8px",
    marginBottom: 8,
  },
  correctionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#b91c1c",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  correctionText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    lineHeight: 1.3,
  },

  /* ── PO meta grid ─────────────────────────────────────────────── */
  // Two-row meta: left half = PO Number / Date Ordered / Customer Order # /
  // Customer Name; right half = Freight / Terms. The long values
  // (PO number, order number) get wider cells so they don't bleed.
  metaTable: {
    border: `1px solid ${BORDER}`,
    marginBottom: 8,
  },
  metaRow: { flexDirection: "row" },
  metaCell: {
    borderRight: `1px solid ${BORDER}`,
    padding: "2px 4px",
    overflow: "hidden",
  },
  metaCellLast: { padding: "2px 4px", overflow: "hidden" },
  metaLabel: {
    fontSize: 6,
    color: SECTION_LABEL,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metaValue: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },

  /* ── Address blocks ───────────────────────────────────────────── */
  addrRow: { flexDirection: "row", marginTop: 6 },
  // Block used inside a column container — no flex:1 so it doesn't try to
  // stretch and overlap siblings (was causing the items table to draw on
  // top of the Ship-To text).
  addrBlock: { paddingRight: 8 },
  addrTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    borderBottom: `1px solid ${BORDER}`,
    paddingBottom: 2,
    marginBottom: 3,
    letterSpacing: 0.5,
  },
  addrLine: { fontSize: 7.5, lineHeight: 1.4 },

  /* ── Vendor box ───────────────────────────────────────────────── */
  vendorBox: {
    border: `1px solid ${BORDER}`,
    padding: "4px 6px",
    marginBottom: 8,
    backgroundColor: LIGHT_BG,
  },
  vendorLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: SECTION_LABEL,
    marginBottom: 2,
  },
  vendorName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 1 },
  vendorLine: { fontSize: 7.5, lineHeight: 1.35 },

  /* ── Divider ──────────────────────────────────────────────────── */
  divider: {
    borderBottom: `1.5px solid ${HEADER_BG}`,
    marginTop: 8,
    marginBottom: 0,
  },

  /* ── Items table ──────────────────────────────────────────────── */
  itemsTable: { border: `1px solid ${BORDER}`, marginTop: 0, flex: 1 },
  thRow: {
    flexDirection: "row",
    backgroundColor: HEADER_BG,
    padding: "3px 0",
  },
  th: {
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  tdRow: {
    flexDirection: "row",
    borderBottom: `1px solid #ddd`,
    minHeight: 16,
  },
  tdRowAlt: {
    flexDirection: "row",
    borderBottom: `1px solid #ddd`,
    minHeight: 16,
    backgroundColor: LIGHT_BG,
  },
  td: { fontSize: 7.5, paddingHorizontal: 4, paddingVertical: 2 },

  /* column widths */
  colItem: { width: "10%" },
  colDesc: { width: "50%" },
  colQty: { width: "10%", textAlign: "center" },
  colUnit: { width: "15%", textAlign: "right" },
  colTotal: { width: "15%", textAlign: "right" },

  /* ── Total row ────────────────────────────────────────────────── */
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTop: `1.5px solid ${HEADER_BG}`,
    paddingTop: 3,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  totalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    marginRight: 24,
  },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: 8, width: "15%", textAlign: "right" },

  /* ── Bottom bar ───────────────────────────────────────────────── */
  bottomRow: {
    flexDirection: "row",
    marginTop: 4,
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 4,
  },
  notesBox: { width: "55%", paddingRight: 12 },
  notesLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: SECTION_LABEL,
    marginBottom: 2,
  },
  notesText: { fontSize: 7.5, lineHeight: 1.4 },
  sigsBox: { width: "45%" },
  sigRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  sigField: { flex: 1, paddingRight: 8 },
  sigLabel: { fontSize: 6.5, color: SECTION_LABEL, textTransform: "uppercase", marginBottom: 1 },
  sigLine: { borderBottom: `1px solid ${BORDER}`, height: 12 },
});

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export interface PdfVendorOrderItem {
  productSkuSnapshot: string | null;
  variantSkuSnapshot: string | null;
  variantNameSnapshot: string | null;
  weightSnapshot: string | null;
  finishCodeSnapshot: string | null;
  finishNameSnapshot: string | null;
  finialCodeSnapshot: string | null;
  finialNameSnapshot: string | null;
  fabricItemNumberSnapshot: string | null;
  fabricNameSnapshot: string | null;
  fabricBrandSnapshot: string | null;
  fabricGradeSnapshot: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  notes: string | null;
  // Effective (PO-facing) SKU / sub-description after any staff edit. When set
  // these take precedence over the raw snapshot fields. `edited` is staff-only
  // and never rendered on the vendor document.
  sku?: string | null;
  subDescription?: string | null;
  edited?: boolean;
  // 'product' = the regular product line on the product vendor's PO.
  // 'fabric'  = a fabric-only line split out to an alternate fabric vendor.
  // When 'fabric', the renderer hides product/variant SKU fields and only
  // shows the fabric item-number + name, since the alternate vendor only
  // ships the fabric.
  kind?: "product" | "fabric";
}

export interface VendorOrderPdfArgs {
  vendorOrderNumber: string;
  dateOrdered: string;
  customerOrderNumber: string | null;
  customerName: string | null;
  notes: string | null;
  // Staff-authored note to the vendor. Rendered in bold, ALL CAPS at the very
  // top of the PO (above the header) so the manufacturer sees it first.
  noteToVendor?: string | null;
  // One-off correction note printed at the VERY top of a resent PO (above the
  // note-to-vendor banner) so the vendor knows to disregard the prior PO.
  correctionNote?: string | null;
  items: PdfVendorOrderItem[];
  manufacturerName: string | null;
  manufacturerAddressLine1: string | null;
  manufacturerAddressLine2: string | null;
  manufacturerCity: string | null;
  manufacturerState: string | null;
  manufacturerPostalCode: string | null;
  manufacturerPhone: string | null;
  manufacturerFax: string | null;
  manufacturerEmail: string | null;
  // Ship-To block. When omitted (or shipToStore=true with no address), the
  // store's own address is used.
  shipToStore?: boolean;
  shipToName?: string | null;
  shipToLine1?: string | null;
  shipToLine2?: string | null;
  shipToCity?: string | null;
  shipToState?: string | null;
  shipToPostalCode?: string | null;
  shipToPhone?: string | null;
}

interface ShipToBlock {
  name: string;
  line1: string | null;
  line2: string | null;
  cityStateZip: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
}

function resolveShipTo(args: VendorOrderPdfArgs): ShipToBlock {
  const useDirect =
    args.shipToStore === false &&
    Boolean(args.shipToLine1 && args.shipToCity && args.shipToState);
  if (useDirect) {
    const cityStateZip = [
      [args.shipToCity, args.shipToState].filter(Boolean).join(", "),
      args.shipToPostalCode,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      name: args.shipToName || args.customerName || "Customer",
      line1: args.shipToLine1 ?? null,
      line2: args.shipToLine2 ?? null,
      cityStateZip: cityStateZip || null,
      phone: args.shipToPhone ?? null,
      fax: null,
      email: null,
    };
  }
  return {
    name: OASIS_NAME,
    line1: OASIS_ADDR1,
    line2: null,
    cityStateZip: OASIS_ADDR2,
    phone: OASIS_PHONE,
    fax: OASIS_FAX,
    email: null,
  };
}

function ShipToView({ shipTo }: { shipTo: ShipToBlock }) {
  return (
    <View style={s.addrBlock}>
      <Text style={s.addrTitle}>Ship To</Text>
      <Text style={s.addrLine}>{shipTo.name}</Text>
      {shipTo.line1 ? <Text style={s.addrLine}>{shipTo.line1}</Text> : null}
      {shipTo.line2 ? <Text style={s.addrLine}>{shipTo.line2}</Text> : null}
      {shipTo.cityStateZip ? (
        <Text style={s.addrLine}>{shipTo.cityStateZip}</Text>
      ) : null}
      {shipTo.phone ? (
        <Text style={s.addrLine}>Phone: {shipTo.phone}</Text>
      ) : null}
      {shipTo.fax ? <Text style={s.addrLine}>Fax: {shipTo.fax}</Text> : null}
    </View>
  );
}

// "Anthracite (UM851-02)" — combine an option's display name with its SKU /
// item number so the vendor can match the line to their catalog at a glance.
function optionWithSku(name: string | null, sku: string | null): string | null {
  if (!name) return null;
  if (!sku) return name;
  return `${name} (${sku})`;
}

// "Sunbrella — Spectrum Cilantro (48022)" — prefix the fabric line with its
// brand and append grade so the vendor can match the exact fabric line.
function fabricOption(it: PdfVendorOrderItem): string | null {
  if (!it.fabricNameSnapshot) return null;
  const brand = it.fabricBrandSnapshot ? `${it.fabricBrandSnapshot} — ` : "";
  const base = optionWithSku(it.fabricNameSnapshot, it.fabricItemNumberSnapshot);
  const grade = it.fabricGradeSnapshot ? ` [Grade ${it.fabricGradeSnapshot}]` : "";
  return `${brand}${base}${grade}`;
}

function weightOption(it: PdfVendorOrderItem): string | null {
  if (it.weightSnapshot == null || it.weightSnapshot.trim() === "") return null;
  const n = Number(it.weightSnapshot);
  if (!Number.isFinite(n)) return null;
  // String(n) drops trailing ".00" so "19.00" reads as "19 lbs".
  return `Weight: ${String(n)} lbs`;
}

function itemOptions(it: PdfVendorOrderItem): string[] {
  return [
    optionWithSku(it.variantNameSnapshot, it.variantSkuSnapshot),
    optionWithSku(it.finishNameSnapshot, it.finishCodeSnapshot),
    optionWithSku(it.finialNameSnapshot, it.finialCodeSnapshot),
    fabricOption(it),
    weightOption(it),
  ].filter((v): v is string => Boolean(v));
}

// Two-cell wide layout: long values (PO Number, Date Ordered, Customer Order #,
// Customer Name) get the full top half, then Freight + Terms on the bottom
// half. Wider cells let the long order numbers fit without bleeding into the
// next column.
function MetaTable(args: {
  vendorOrderNumber: string;
  dateOrdered: string;
  customerOrderNumber: string | null;
  customerName: string | null;
}) {
  const { vendorOrderNumber, dateOrdered, customerOrderNumber, customerName } =
    args;
  return (
    <View style={s.metaTable}>
      {/* Row 1: PO Number | Date Ordered */}
      <View
        style={[
          s.metaRow,
          { borderBottom: `1px solid ${BORDER}` },
        ]}
      >
        <View style={[s.metaCell, { width: "50%" }]}>
          <Text style={s.metaLabel}>PO Number</Text>
          <Text style={s.metaValue}>{vendorOrderNumber}</Text>
        </View>
        <View style={[s.metaCellLast, { width: "50%" }]}>
          <Text style={s.metaLabel}>Date Ordered</Text>
          <Text style={s.metaValue}>{fmtDate(dateOrdered)}</Text>
        </View>
      </View>
      {/* Row 2: Customer Order # | Customer Name */}
      <View
        style={[s.metaRow, { borderBottom: `1px solid ${BORDER}` }]}
      >
        <View style={[s.metaCell, { width: "50%" }]}>
          <Text style={s.metaLabel}>Customer Order #</Text>
          <Text style={s.metaValue}>{customerOrderNumber ?? "—"}</Text>
        </View>
        <View style={[s.metaCellLast, { width: "50%" }]}>
          <Text style={s.metaLabel}>Customer Name</Text>
          <Text style={s.metaValue}>{customerName ?? "—"}</Text>
        </View>
      </View>
      {/* Row 3: Freight | Terms */}
      <View style={s.metaRow}>
        <View style={[s.metaCell, { width: "50%" }]}>
          <Text style={s.metaLabel}>Freight</Text>
          <Text style={s.metaValue}>—</Text>
        </View>
        <View style={[s.metaCellLast, { width: "50%" }]}>
          <Text style={s.metaLabel}>Terms</Text>
          <Text style={s.metaValue}>—</Text>
        </View>
      </View>
    </View>
  );
}

function VendorOrderDocument(args: VendorOrderPdfArgs) {
  const {
    vendorOrderNumber,
    dateOrdered,
    notes,
    items,
    manufacturerName,
    manufacturerAddressLine1,
    manufacturerAddressLine2,
    manufacturerCity,
    manufacturerState,
    manufacturerPostalCode,
    manufacturerPhone,
    manufacturerFax,
    manufacturerEmail,
  } = args;

  const cityStateZip = [
    [manufacturerCity, manufacturerState].filter(Boolean).join(", "),
    manufacturerPostalCode,
  ]
    .filter(Boolean)
    .join(" ");

  const shipTo = resolveShipTo(args);

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        {/* ── Correction note (resend only, VERY top of doc) ───── */}
        {args.correctionNote && args.correctionNote.trim() ? (
          <View style={s.correctionBanner}>
            <Text style={s.correctionLabel}>PO CORRECTION NOTICE</Text>
            <Text style={s.correctionText}>
              {args.correctionNote.toUpperCase()}
            </Text>
          </View>
        ) : null}

        {/* ── Note to Vendor (bold, ALL CAPS, top of doc) ──────── */}
        {args.noteToVendor && args.noteToVendor.trim() ? (
          <View style={s.noteToVendorBanner}>
            <Text style={s.noteToVendorText}>
              {args.noteToVendor.toUpperCase()}
            </Text>
          </View>
        ) : null}

        {/* ── Header ───────────────────────────────────────────── */}
        <View style={s.row}>
          {/* Left: branding + vendor + ship-to */}
          <View style={s.headerLeft}>
            <Image src={LOGO_SRC} style={s.brandLogo} />

            {/* Vendor box */}
            <View style={s.vendorBox}>
              <Text style={s.vendorLabel}>Vendor</Text>
              {manufacturerName ? (
                <Text style={s.vendorName}>{manufacturerName}</Text>
              ) : (
                <Text style={[s.vendorName, { color: "#999" }]}>—</Text>
              )}
              {manufacturerAddressLine1 && (
                <Text style={s.vendorLine}>{manufacturerAddressLine1}</Text>
              )}
              {manufacturerAddressLine2 && (
                <Text style={s.vendorLine}>{manufacturerAddressLine2}</Text>
              )}
              {cityStateZip ? (
                <Text style={s.vendorLine}>{cityStateZip}</Text>
              ) : null}
              {manufacturerPhone && (
                <Text style={s.vendorLine}>Phone: {manufacturerPhone}</Text>
              )}
              {manufacturerFax && (
                <Text style={s.vendorLine}>Fax: {manufacturerFax}</Text>
              )}
              {manufacturerEmail && (
                <Text style={s.vendorLine}>{manufacturerEmail}</Text>
              )}
            </View>

            <ShipToView shipTo={shipTo} />
          </View>

          {/* Right: PO meta + bill to */}
          <View style={s.headerRight}>
            <Text style={s.poTitle}>PURCHASE ORDER</Text>

            <MetaTable
              vendorOrderNumber={vendorOrderNumber}
              dateOrdered={dateOrdered}
              customerOrderNumber={args.customerOrderNumber}
              customerName={args.customerName}
            />

            {/* Bill To */}
            <View style={s.addrBlock}>
              <Text style={s.addrTitle}>Bill To</Text>
              <Text style={s.addrLine}>{OASIS_NAME}</Text>
              <Text style={s.addrLine}>{OASIS_ADDR1}</Text>
              <Text style={s.addrLine}>{OASIS_ADDR2}</Text>
              <Text style={s.addrLine}>{OASIS_EMAIL}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Items table ──────────────────────────────────────── */}
        <View style={{ marginTop: 6, flex: 1 }}>
          {/* Header */}
          <View style={s.thRow}>
            <Text style={[s.th, s.colItem, { width: "18%" }]}>Item #</Text>
            <Text style={[s.th, s.colDesc, { width: "60%" }]}>Item Description</Text>
            <Text style={[s.th, s.colQty, { width: "22%" }]}>Order Qty</Text>
          </View>

          {/* Rows */}
          {items.map((it, idx) => {
            const isFabric = it.kind === "fabric";
            // Fabric-only POs ship just the fabric, so the SKU column shows
            // the fabric item number (not the product/variant SKU) and the
            // description shows the fabric name. The original product
            // description appears below as a "for" reference so the vendor
            // knows which Oasis line this fabric is being cut for.
            const sku = isFabric
              ? (it.fabricItemNumberSnapshot ?? "")
              : (it.sku ?? it.variantSkuSnapshot ?? it.productSkuSnapshot ?? "");
            const mainDesc = isFabric
              ? (it.fabricNameSnapshot || "Fabric")
              : (it.description || "—");
            const options = isFabric
              ? [
                  it.description
                    ? `for ${it.description}${it.variantNameSnapshot ? ` — ${it.variantNameSnapshot}` : ""}`
                    : null,
                ].filter((v): v is string => Boolean(v))
              : // A staff-edited line carries a single sub-description override
                // that stands in for the option lines; unedited lines render
                // the derived option list.
                it.edited && it.subDescription
                ? [it.subDescription]
                : itemOptions(it);
            const rowBg = idx % 2 === 0 ? "#fff" : LIGHT_BG;
            return (
              <React.Fragment key={idx}>
                <View style={[s.tdRow, { backgroundColor: rowBg }]}>
                  <Text style={[s.td, s.colItem, { width: "18%" }]}>{sku}</Text>
                  {/* Description cell: main text + indented option lines */}
                  <View style={[s.colDesc, { width: "60%", paddingVertical: 2 }]}>
                    <Text style={[s.td, { paddingVertical: 0 }]}>{mainDesc}</Text>
                    {options.map((opt, oi) => (
                      <Text
                        key={oi}
                        style={{
                          fontSize: 6.5,
                          color: "#555",
                          fontFamily: "Helvetica-Oblique",
                          paddingLeft: 8,
                          lineHeight: 1.4,
                        }}
                      >
                        › {opt}
                      </Text>
                    ))}
                  </View>
                  <Text style={[s.td, s.colQty, { width: "22%" }]}>{it.quantity}</Text>
                </View>
                {it.notes ? (
                  <View style={{ backgroundColor: "#fffef5", borderBottom: "1px solid #ddd", paddingHorizontal: 4, paddingBottom: 2 }}>
                    <Text style={{ fontSize: 7, color: "#666", fontFamily: "Helvetica-Oblique" }}>
                      Note: {it.notes}
                    </Text>
                  </View>
                ) : null}
              </React.Fragment>
            );
          })}
        </View>

        {/* ── Bottom bar ───────────────────────────────────────── */}
        <View style={s.bottomRow}>
          {/* Notes */}
          <View style={s.notesBox}>
            <Text style={s.notesLabel}>Additional Notes</Text>
            <Text style={s.notesText}>{notes || "—"}</Text>
          </View>

          {/* Signature fields */}
          <View style={s.sigsBox}>
            <View style={s.sigRow}>
              <View style={s.sigField}>
                <Text style={s.sigLabel}>Auth Sign</Text>
                <View style={s.sigLine} />
              </View>
              <View style={s.sigField}>
                <Text style={s.sigLabel}>Order Date</Text>
                <View style={s.sigLine} />
              </View>
            </View>
            <View style={s.sigRow}>
              <View style={s.sigField}>
                <Text style={s.sigLabel}>Rec By</Text>
                <View style={s.sigLine} />
              </View>
              <View style={s.sigField}>
                <Text style={s.sigLabel}>Date Rec</Text>
                <View style={s.sigLine} />
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateVendorOrderPdf(
  args: VendorOrderPdfArgs,
): Promise<Buffer> {
  return renderToBuffer(<VendorOrderDocument {...args} />);
}

/* ─────────────────────────────────────────────────────────────────────
 * Cancellation notice PDF
 * Same shell as the PO, but with a red banner, a cancelled-items table
 * (struck through) and an optional remaining-items table for partial
 * cancellations so the vendor can clearly see the revised PO.
 * ───────────────────────────────────────────────────────────────────── */

const CANCEL_RED = "#b91c1c";

const cs = StyleSheet.create({
  banner: {
    backgroundColor: CANCEL_RED,
    color: "#fff",
    padding: "6px 8px",
    marginBottom: 8,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textAlign: "center",
  },
  sectionLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 3,
    color: HEADER_BG,
  },
  sectionLabelCancelled: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 3,
    color: CANCEL_RED,
  },
  cancelledStrike: {
    textDecoration: "line-through",
    color: "#666",
  },
  reasonBox: {
    border: `1px solid ${CANCEL_RED}`,
    backgroundColor: "#fff5f5",
    padding: "4px 6px",
    marginBottom: 6,
  },
  reasonLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: CANCEL_RED,
    marginBottom: 2,
  },
  reasonText: { fontSize: 8, lineHeight: 1.4 },
});

export interface VendorOrderCancellationPdfArgs extends VendorOrderPdfArgs {
  scope: "full" | "partial";
  reason: string | null;
  cancelledItems: PdfVendorOrderItem[];
  remainingItems: PdfVendorOrderItem[];
  cancelledAt: string;
}

function ItemsTable({
  items,
  struck,
}: {
  items: PdfVendorOrderItem[];
  struck: boolean;
}) {
  if (items.length === 0) return null;
  const total = items.reduce((sum, it) => sum + it.amount, 0);
  return (
    <View>
      <View style={s.thRow}>
        <Text style={[s.th, s.colItem]}>Item #</Text>
        <Text style={[s.th, s.colDesc]}>Item Description</Text>
        <Text style={[s.th, s.colQty]}>Qty</Text>
        <Text style={[s.th, s.colUnit, { textAlign: "right" }]}>Unit Price</Text>
        <Text style={[s.th, s.colTotal, { textAlign: "right" }]}>Total</Text>
      </View>
      {items.map((it, idx) => {
        const sku = it.variantSkuSnapshot ?? it.productSkuSnapshot ?? "";
        const mainDesc = it.description || "—";
        const options = itemOptions(it);
        const rowBg = idx % 2 === 0 ? "#fff" : LIGHT_BG;
        const cellStyle = struck ? cs.cancelledStrike : {};
        return (
          <React.Fragment key={idx}>
            <View style={[s.tdRow, { backgroundColor: rowBg }]}>
              <Text style={[s.td, s.colItem, cellStyle]}>{sku}</Text>
              <View style={[s.colDesc, { paddingVertical: 2 }]}>
                <Text style={[s.td, { paddingVertical: 0 }, cellStyle]}>
                  {mainDesc}
                </Text>
                {options.map((opt, oi) => (
                  <Text
                    key={oi}
                    style={{
                      fontSize: 6.5,
                      color: "#555",
                      fontFamily: "Helvetica-Oblique",
                      paddingLeft: 8,
                      lineHeight: 1.4,
                      ...(struck ? { textDecoration: "line-through" } : {}),
                    }}
                  >
                    › {opt}
                  </Text>
                ))}
              </View>
              <Text style={[s.td, s.colQty, cellStyle]}>{it.quantity}</Text>
              <Text style={[s.td, s.colUnit, cellStyle]}>
                {fmtMoney(it.unitPrice)}
              </Text>
              <Text style={[s.td, s.colTotal, cellStyle]}>
                {fmtMoney(it.amount)}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>
          {struck ? "Cancelled total:" : "Remaining total:"}
        </Text>
        <Text style={s.totalValue}>{fmtMoney(total)}</Text>
      </View>
    </View>
  );
}

function VendorOrderCancellationDocument(args: VendorOrderCancellationPdfArgs) {
  const {
    vendorOrderNumber,
    dateOrdered,
    notes,
    manufacturerName,
    manufacturerAddressLine1,
    manufacturerAddressLine2,
    manufacturerCity,
    manufacturerState,
    manufacturerPostalCode,
    manufacturerPhone,
    manufacturerFax,
    manufacturerEmail,
    scope,
    reason,
    cancelledItems,
    remainingItems,
    cancelledAt,
  } = args;

  const cityStateZip = [
    [manufacturerCity, manufacturerState].filter(Boolean).join(", "),
    manufacturerPostalCode,
  ]
    .filter(Boolean)
    .join(" ");

  const headlineLabel =
    scope === "full"
      ? "PURCHASE ORDER CANCELLATION"
      : "REVISED PURCHASE ORDER — PARTIAL CANCELLATION";

  const shipTo = resolveShipTo(args);

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View style={s.row}>
          <View style={s.headerLeft}>
            <Image src={LOGO_SRC} style={s.brandLogo} />

            <View style={s.vendorBox}>
              <Text style={s.vendorLabel}>Vendor</Text>
              {manufacturerName ? (
                <Text style={s.vendorName}>{manufacturerName}</Text>
              ) : (
                <Text style={[s.vendorName, { color: "#999" }]}>—</Text>
              )}
              {manufacturerAddressLine1 && (
                <Text style={s.vendorLine}>{manufacturerAddressLine1}</Text>
              )}
              {manufacturerAddressLine2 && (
                <Text style={s.vendorLine}>{manufacturerAddressLine2}</Text>
              )}
              {cityStateZip ? <Text style={s.vendorLine}>{cityStateZip}</Text> : null}
              {manufacturerPhone && (
                <Text style={s.vendorLine}>Phone: {manufacturerPhone}</Text>
              )}
              {manufacturerFax && (
                <Text style={s.vendorLine}>Fax: {manufacturerFax}</Text>
              )}
              {manufacturerEmail && (
                <Text style={s.vendorLine}>{manufacturerEmail}</Text>
              )}
            </View>

            <ShipToView shipTo={shipTo} />
          </View>

          <View style={s.headerRight}>
            <Text style={[cs.banner]}>{headlineLabel}</Text>

            <MetaTable
              vendorOrderNumber={vendorOrderNumber}
              dateOrdered={dateOrdered}
              customerOrderNumber={args.customerOrderNumber}
              customerName={args.customerName}
            />

            <View style={s.addrBlock}>
              <Text style={s.addrTitle}>Bill To</Text>
              <Text style={s.addrLine}>{OASIS_NAME}</Text>
              <Text style={s.addrLine}>{OASIS_ADDR1}</Text>
              <Text style={s.addrLine}>{OASIS_ADDR2}</Text>
              <Text style={s.addrLine}>{OASIS_EMAIL}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {reason ? (
          <View style={cs.reasonBox}>
            <Text style={cs.reasonLabel}>Reason for cancellation</Text>
            <Text style={cs.reasonText}>{reason}</Text>
          </View>
        ) : null}

        <Text style={cs.sectionLabelCancelled}>
          Cancelled items
          {scope === "partial" ? " (no longer ordered)" : ""}
        </Text>
        <ItemsTable items={cancelledItems} struck={true} />

        {scope === "partial" && remainingItems.length > 0 ? (
          <>
            <Text style={cs.sectionLabel}>
              Remaining items (this PO is still open for the items below)
            </Text>
            <ItemsTable items={remainingItems} struck={false} />
          </>
        ) : null}

        <View style={s.bottomRow}>
          <View style={s.notesBox}>
            <Text style={s.notesLabel}>Additional Notes</Text>
            <Text style={s.notesText}>
              {notes || "—"}
              {"\n"}Cancelled at: {fmtDate(cancelledAt)}
            </Text>
          </View>
          <View style={s.sigsBox}>
            <View style={s.sigRow}>
              <View style={s.sigField}>
                <Text style={s.sigLabel}>Auth Sign</Text>
                <View style={s.sigLine} />
              </View>
              <View style={s.sigField}>
                <Text style={s.sigLabel}>Date</Text>
                <View style={s.sigLine} />
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateVendorOrderCancellationPdf(
  args: VendorOrderCancellationPdfArgs,
): Promise<Buffer> {
  return renderToBuffer(<VendorOrderCancellationDocument {...args} />);
}
