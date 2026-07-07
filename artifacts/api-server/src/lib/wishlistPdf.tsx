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

/**
 * Staff-only printable "Wishlist Copy" (Brief 7, Step 5).
 *
 * Mirrors the customer order print layout (`customerOrderPdf.tsx`) — same
 * logo/address header, items table structure, and footer style — with the
 * order-specific pieces (payments, delivery, tax, deposit/balance) removed
 * and a prominent "not an order" banner added. Always shows live
 * sale-or-MSRP pricing; never reads `price_at_save`.
 */

const OASIS_NAME = "Oasis Garden & Patio";
const OASIS_ADDR1 = "21182 Centre Pointe Pkwy #100";
const OASIS_ADDR2 = "Santa Clarita, CA 91350";
const OASIS_PHONE = "(661) 255-9909";

const BORDER = "#1a1a1a";
const SOFT_BORDER = "#888";
const LIGHT_BG = "#f7f7f5";
const LABEL = "#555";
const AMBER_BG = "#fef3c7";
const AMBER_BORDER = "#b45309";
const AMBER_TEXT = "#78350f";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    padding: 28,
    backgroundColor: "#fff",
    color: "#1a1a1a",
  },
  row: { flexDirection: "row" },

  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  brandCol: { width: "55%", paddingRight: 12 },
  brandLogo: { width: 180, height: 64, objectFit: "contain" },
  brandAddr: {
    fontSize: 8,
    textAlign: "center",
    width: 180,
    marginTop: 2,
    lineHeight: 1.3,
  },
  titleCol: { width: "45%", alignItems: "flex-end" },
  formTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
  },
  formNumber: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    border: `1px solid ${BORDER}`,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 6,
    minWidth: 160,
    textAlign: "center",
  },

  banner: {
    marginTop: 10,
    border: `1.5px solid ${AMBER_BORDER}`,
    backgroundColor: AMBER_BG,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  bannerText: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: AMBER_TEXT,
    textAlign: "center",
  },

  infoTable: {
    border: `1px solid ${BORDER}`,
    marginTop: 12,
  },
  infoRow: {
    flexDirection: "row",
    borderBottom: `1px solid ${BORDER}`,
  },
  infoRowLast: { flexDirection: "row" },
  infoCell: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRight: `1px solid ${BORDER}`,
    flexDirection: "row",
    alignItems: "baseline",
  },
  infoCellLast: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "baseline",
  },
  infoLabel: {
    fontSize: 7,
    color: LABEL,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginRight: 6,
  },
  infoValue: { fontSize: 9 },

  itemsTable: {
    border: `1px solid ${BORDER}`,
    marginTop: 12,
  },
  thRow: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    paddingVertical: 4,
  },
  th: {
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  tdRow: {
    flexDirection: "row",
    borderBottom: `1px solid ${SOFT_BORDER}`,
    minHeight: 22,
    alignItems: "flex-start",
    paddingVertical: 3,
  },
  td: { fontSize: 8.5, paddingHorizontal: 4 },

  colSku: { width: "15%" },
  colQty: { width: "8%", textAlign: "center" },
  colDesc: { width: "32%" },
  colMfg: { width: "15%" },
  colPrice: { width: "15%", textAlign: "right" },
  colAmt: { width: "15%", textAlign: "right" },

  itemSub: { fontSize: 7, color: LABEL, marginTop: 1 },

  totalsBox: { width: "45%", border: `1px solid ${BORDER}`, marginTop: 10, marginLeft: "55%" },
  totalRow: {
    flexDirection: "row",
    borderBottom: `1px solid ${BORDER}`,
  },
  totalRowLast: { flexDirection: "row" },
  totalLabelCell: {
    width: "55%",
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textTransform: "uppercase",
    borderRight: `1px solid ${BORDER}`,
    backgroundColor: LIGHT_BG,
  },
  totalValueCell: {
    width: "45%",
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 9,
    textAlign: "right",
  },
  totalEmphasis: { fontFamily: "Helvetica-Bold" },
  subtotalNote: {
    fontSize: 7,
    color: LABEL,
    marginTop: 4,
    textAlign: "right",
  },

  copyFooter: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 4,
    textTransform: "uppercase",
    color: "#1a1a1a",
  },
  pageNo: {
    position: "absolute",
    bottom: 14,
    right: 28,
    fontSize: 7,
    color: LABEL,
  },
});

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
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

export interface PdfWishlistItem {
  description: string;
  sku: string | null;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number | null;
  amount: number | null;
  manufacturerName: string | null;
}

export interface PdfWishlistArgs {
  wishlistNumber: string;
  createdAt: string;
  customerName: string;
  salespersonName?: string | null;
  items: PdfWishlistItem[];
  subtotal: number;
  hasUnpricedItems: boolean;
}

function CustomerInfo({ args }: { args: PdfWishlistArgs }) {
  return (
    <View style={s.infoTable}>
      <View style={s.infoRowLast}>
        <View style={[s.infoCell, { width: "50%" }]}>
          <Text style={s.infoLabel}>Date</Text>
          <Text style={s.infoValue}>{fmtDate(args.createdAt)}</Text>
        </View>
        <View style={[s.infoCellLast, { width: "50%" }]}>
          <Text style={s.infoLabel}>Salesperson</Text>
          <Text style={s.infoValue}>{args.salespersonName ?? "—"}</Text>
        </View>
      </View>
      <View style={s.infoRowLast}>
        <View style={[s.infoCellLast, { width: "100%" }]}>
          <Text style={s.infoLabel}>Name</Text>
          <Text style={s.infoValue}>{args.customerName}</Text>
        </View>
      </View>
    </View>
  );
}

function ItemsTable({ items }: { items: PdfWishlistItem[] }) {
  return (
    <View style={s.itemsTable}>
      <View style={s.thRow} fixed>
        <Text style={[s.th, s.colDesc]}>Description</Text>
        <Text style={[s.th, s.colMfg]}>Manufacturer</Text>
        <Text style={[s.th, s.colSku]}>SKU</Text>
        <Text style={[s.th, s.colQty]}>Qty</Text>
        <Text style={[s.th, s.colPrice]}>Price</Text>
        <Text style={[s.th, s.colAmt]}>Amount</Text>
      </View>
      {items.map((it, idx) => (
        <View style={s.tdRow} key={idx} wrap={false}>
          <View style={[s.colDesc, { paddingHorizontal: 4 }]}>
            <Text style={{ fontSize: 8.5 }}>{it.description}</Text>
            {it.variantLabel && (
              <Text style={s.itemSub}>{it.variantLabel}</Text>
            )}
          </View>
          <Text style={[s.td, s.colMfg]}>{it.manufacturerName ?? "—"}</Text>
          <Text style={[s.td, s.colSku]}>{it.sku ?? "—"}</Text>
          <Text style={[s.td, s.colQty]}>{it.quantity}</Text>
          <Text style={[s.td, s.colPrice]}>{fmtMoney(it.unitPrice)}</Text>
          <Text style={[s.td, s.colAmt]}>{fmtMoney(it.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

function SubtotalBox({ args }: { args: PdfWishlistArgs }) {
  return (
    <>
      <View style={s.totalsBox}>
        <View style={s.totalRowLast}>
          <Text style={s.totalLabelCell}>Subtotal</Text>
          <Text style={[s.totalValueCell, s.totalEmphasis]}>
            {fmtMoney(args.subtotal)}
          </Text>
        </View>
      </View>
      {args.hasUnpricedItems && (
        <Text style={s.subtotalNote}>
          Subtotal does not include items with no listed price.
        </Text>
      )}
    </>
  );
}

function WishlistPdfPage({ args }: { args: PdfWishlistArgs }) {
  return (
    <Page size="LETTER" style={s.page}>
      <View style={s.headerRow}>
        <View style={s.brandCol}>
          <Image src={OASIS_LOGO_DATA_URL} style={s.brandLogo} />
          <Text style={s.brandAddr}>
            {OASIS_ADDR1}
            {"\n"}
            {OASIS_ADDR2}
            {"\n"}
            {OASIS_PHONE}
          </Text>
        </View>
        <View style={s.titleCol}>
          <Text style={s.formTitle}>WISHLIST</Text>
          <Text style={s.formNumber}>{args.wishlistNumber}</Text>
        </View>
      </View>

      <View style={s.banner}>
        <Text style={s.bannerText}>
          WISHLIST -- Not an order. No payment or delivery arranged.
        </Text>
      </View>

      <CustomerInfo args={args} />
      <ItemsTable items={args.items} />
      <SubtotalBox args={args} />

      <Text style={s.copyFooter} fixed>
        Wishlist Copy
      </Text>
      <Text
        style={s.pageNo}
        fixed
        render={({ pageNumber, totalPages }) =>
          totalPages > 1 ? `Page ${pageNumber} / ${totalPages}` : ""
        }
      />
    </Page>
  );
}

function WishlistDocument(args: PdfWishlistArgs) {
  return (
    <Document>
      <WishlistPdfPage args={args} />
    </Document>
  );
}

export async function generateWishlistPdf(
  args: PdfWishlistArgs,
): Promise<Buffer> {
  return renderToBuffer(<WishlistDocument {...args} />);
}
