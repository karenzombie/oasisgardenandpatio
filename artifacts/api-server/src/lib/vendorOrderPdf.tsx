import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

const OASIS_NAME = "Oasis Garden & Patio";
const OASIS_ADDR1 = "21182 Centre Pointe Parkway #100";
const OASIS_ADDR2 = "Santa Clarita, CA 91350";
const OASIS_PHONE = "(661) 255-9909";
const OASIS_FAX = "(661) 255-9915";
const OASIS_EMAIL = "sales@oasisgardenandpatio.com";

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

  brandTitle: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 4,
    color: HEADER_BG,
    lineHeight: 1,
  },
  brandSub: {
    fontSize: 11,
    fontFamily: "Helvetica-Oblique",
    color: "#444",
    marginBottom: 8,
    letterSpacing: 1.5,
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

  /* ── PO meta grid ─────────────────────────────────────────────── */
  metaTable: {
    border: `1px solid ${BORDER}`,
    marginBottom: 8,
  },
  metaRow: { flexDirection: "row" },
  metaCell: {
    flex: 1,
    borderRight: `1px solid ${BORDER}`,
    padding: "2px 4px",
  },
  metaCellLast: { flex: 1, padding: "2px 4px" },
  metaLabel: {
    fontSize: 6,
    color: SECTION_LABEL,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metaValue: { fontSize: 8, fontFamily: "Helvetica-Bold" },

  /* ── Address blocks ───────────────────────────────────────────── */
  addrRow: { flexDirection: "row", marginTop: 6 },
  addrBlock: { flex: 1, paddingRight: 8 },
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
  fabricNameSnapshot: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  notes: string | null;
}

export interface VendorOrderPdfArgs {
  vendorOrderNumber: string;
  dateOrdered: string;
  customerOrderNumber: string | null;
  customerName: string | null;
  notes: string | null;
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

  const total = items.reduce((sum, it) => sum + it.amount, 0);

  const cityStateZip = [
    [manufacturerCity, manufacturerState].filter(Boolean).join(", "),
    manufacturerPostalCode,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        {/* ── Header ───────────────────────────────────────────── */}
        <View style={s.row}>
          {/* Left: branding + vendor */}
          <View style={s.headerLeft}>
            <Text style={s.brandTitle}>OASIS</Text>
            <Text style={s.brandSub}>Garden &amp; Patio</Text>

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

            {/* Ship To */}
            <View style={s.addrBlock}>
              <Text style={s.addrTitle}>Ship To</Text>
              <Text style={s.addrLine}>{OASIS_NAME}</Text>
              <Text style={s.addrLine}>{OASIS_ADDR1}</Text>
              <Text style={s.addrLine}>{OASIS_ADDR2}</Text>
              <Text style={s.addrLine}>Phone: {OASIS_PHONE}</Text>
              <Text style={s.addrLine}>Fax: {OASIS_FAX}</Text>
            </View>
          </View>

          {/* Right: PO meta + bill to */}
          <View style={s.headerRight}>
            <Text style={s.poTitle}>PURCHASE ORDER</Text>

            {/* Meta table */}
            <View style={s.metaTable}>
              {/* Header row */}
              <View style={[s.metaRow, { backgroundColor: "#e8e8e5", borderBottom: `1px solid ${BORDER}` }]}>
                {["PO Number", "Date Ordered", "Customer Order #", "Customer Name", "Freight", "Terms"].map((label, i, arr) => (
                  <View key={label} style={i < arr.length - 1 ? s.metaCell : s.metaCellLast}>
                    <Text style={s.metaLabel}>{label}</Text>
                  </View>
                ))}
              </View>
              {/* Values row */}
              <View style={s.metaRow}>
                <View style={s.metaCell}>
                  <Text style={s.metaValue}>{vendorOrderNumber}</Text>
                </View>
                <View style={s.metaCell}>
                  <Text style={s.metaValue}>{fmtDate(dateOrdered)}</Text>
                </View>
                <View style={s.metaCell}>
                  <Text style={s.metaValue}>{args.customerOrderNumber ?? "—"}</Text>
                </View>
                <View style={s.metaCell}>
                  <Text style={s.metaValue}>{args.customerName ?? "—"}</Text>
                </View>
                <View style={s.metaCell}>
                  <Text style={s.metaValue}>—</Text>
                </View>
                <View style={s.metaCellLast}>
                  <Text style={s.metaValue}>—</Text>
                </View>
              </View>
            </View>

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
            <Text style={[s.th, s.colItem]}>Item #</Text>
            <Text style={[s.th, s.colDesc]}>Item Description</Text>
            <Text style={[s.th, s.colQty]}>Order Qty</Text>
            <Text style={[s.th, s.colUnit, { textAlign: "right" }]}>Unit Price</Text>
            <Text style={[s.th, s.colTotal, { textAlign: "right" }]}>Total</Text>
          </View>

          {/* Rows */}
          {items.map((it, idx) => {
            const sku = it.variantSkuSnapshot ?? it.productSkuSnapshot ?? "";
            const mainDesc = it.description || "—";
            const options: string[] = [
              it.variantNameSnapshot,
              it.fabricNameSnapshot,
            ].filter((v): v is string => Boolean(v));
            const rowBg = idx % 2 === 0 ? "#fff" : LIGHT_BG;
            return (
              <React.Fragment key={idx}>
                <View style={[s.tdRow, { backgroundColor: rowBg }]}>
                  <Text style={[s.td, s.colItem]}>{sku}</Text>
                  {/* Description cell: main text + indented option lines */}
                  <View style={[s.colDesc, { paddingVertical: 2 }]}>
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
                  <Text style={[s.td, s.colQty]}>{it.quantity}</Text>
                  <Text style={[s.td, s.colUnit]}>{fmtMoney(it.unitPrice)}</Text>
                  <Text style={[s.td, s.colTotal]}>{fmtMoney(it.amount)}</Text>
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

          {/* Total row */}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Order Total:</Text>
            <Text style={s.totalValue}>{fmtMoney(total)}</Text>
          </View>
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
