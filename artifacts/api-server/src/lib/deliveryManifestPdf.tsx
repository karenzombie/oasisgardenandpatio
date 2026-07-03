import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

/**
 * Delivery Manifest Summary PDF (Brief 6, Section 3F, Document 1).
 *
 * A single-page US Letter portrait sheet listing every order checked on
 * the Local Deliveries tab, in the same sort order as the tab
 * (scheduled date, then scheduled time window, NULLS LAST).
 */

export interface DeliveryManifestAddress {
  recipientName: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

export interface DeliveryManifestRow {
  orderNumber: string;
  customerName: string | null;
  shippingAddress: DeliveryManifestAddress | null;
  scheduledDeliveryDate: string | null;
  scheduledDeliveryTimeLabel: string;
  total: number;
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "Not set";
  const [y, m, day] = d.split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !day) return d;
  return `${m}/${day}/${y}`;
}

function fmtAddress(a: DeliveryManifestAddress | null): string {
  if (!a) return "—";
  const line1 = [a.street1, a.street2].filter(Boolean).join(", ");
  const line2 = [a.city, [a.state, a.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [line1, line2].filter(Boolean).join("\n") || "—";
}

const BORDER = "#1a1a1a";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 11,
    padding: 72, // 1 inch margins on US Letter
    backgroundColor: "#fff",
    color: "#1a1a1a",
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  table: {
    border: `1px solid ${BORDER}`,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderBottom: `1px solid ${BORDER}`,
  },
  row: {
    flexDirection: "row",
    borderBottom: `1px solid ${BORDER}`,
  },
  // Cells are Views (which establish a hard width boundary for layout)
  // wrapping a Text (which does the actual word-wrapping). Applying width
  // directly to a <Text> does not reliably contain long unbroken tokens
  // (e.g. order numbers) in react-pdf -- the text can overflow past its
  // column and visually bleed into the next one. Wrapping in a sized View
  // fixes that regardless of content length.
  cell: {
    padding: 6,
    borderRight: `1px solid ${BORDER}`,
  },
  headerCell: {
    padding: 6,
    borderRight: `1px solid ${BORDER}`,
  },
  cellText: {
    fontSize: 11,
  },
  headerCellText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  // Order # and Customer are the widest/longest fields (order numbers run
  // ~17 chars, customer names vary), so they get the most room; the
  // remaining columns are sized down to fit within 100%.
  colOrder: { width: "16%" },
  colCustomer: { width: "23%" },
  colAddress: { width: "22%" },
  colDate: { width: "10%" },
  colTime: { width: "17%" },
  colTotal: { width: "12%", borderRight: "none" },
  totalText: { textAlign: "right" },
});

function ManifestDocument({
  rows,
  generatedAt,
}: {
  rows: DeliveryManifestRow[];
  generatedAt: string;
}) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>Oasis Garden and Patio -- Delivery Manifest</Text>
        <Text style={s.subtitle}>
          Total deliveries: {rows.length} · Generated {generatedAt}
        </Text>

        <View style={s.table}>
          <View style={s.headerRow} fixed>
            <View style={[s.headerCell, s.colOrder]}>
              <Text style={s.headerCellText}>Order #</Text>
            </View>
            <View style={[s.headerCell, s.colCustomer]}>
              <Text style={s.headerCellText}>Customer</Text>
            </View>
            <View style={[s.headerCell, s.colAddress]}>
              <Text style={s.headerCellText}>Shipping Address</Text>
            </View>
            <View style={[s.headerCell, s.colDate]}>
              <Text style={s.headerCellText}>Date</Text>
            </View>
            <View style={[s.headerCell, s.colTime]}>
              <Text style={s.headerCellText}>Time Window</Text>
            </View>
            <View style={[s.headerCell, s.colTotal]}>
              <Text style={[s.headerCellText, s.totalText]}>Total</Text>
            </View>
          </View>
          {rows.map((r) => (
            <View style={s.row} key={r.orderNumber} wrap={false}>
              <View style={[s.cell, s.colOrder]}>
                <Text style={s.cellText}>{r.orderNumber}</Text>
              </View>
              <View style={[s.cell, s.colCustomer]}>
                <Text style={s.cellText}>{r.customerName ?? "—"}</Text>
              </View>
              <View style={[s.cell, s.colAddress]}>
                <Text style={s.cellText}>{fmtAddress(r.shippingAddress)}</Text>
              </View>
              <View style={[s.cell, s.colDate]}>
                <Text style={s.cellText}>
                  {fmtDate(r.scheduledDeliveryDate)}
                </Text>
              </View>
              <View style={[s.cell, s.colTime]}>
                <Text style={s.cellText}>{r.scheduledDeliveryTimeLabel}</Text>
              </View>
              <View style={[s.cell, s.colTotal]}>
                <Text style={[s.cellText, s.totalText]}>
                  {fmtMoney(r.total)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function generateDeliveryManifestSummaryPdf(
  rows: DeliveryManifestRow[],
): Promise<Buffer> {
  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return renderToBuffer(
    <ManifestDocument rows={rows} generatedAt={generatedAt} />,
  );
}
