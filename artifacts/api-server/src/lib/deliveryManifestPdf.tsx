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
  cell: {
    padding: 6,
    borderRight: `1px solid ${BORDER}`,
    fontSize: 11,
  },
  headerCell: {
    padding: 6,
    borderRight: `1px solid ${BORDER}`,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  colOrder: { width: "13%" },
  colCustomer: { width: "20%" },
  colAddress: { width: "27%" },
  colDate: { width: "12%" },
  colTime: { width: "18%" },
  colTotal: { width: "10%", borderRight: "none", textAlign: "right" },
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
            <Text style={[s.headerCell, s.colOrder]}>Order #</Text>
            <Text style={[s.headerCell, s.colCustomer]}>Customer</Text>
            <Text style={[s.headerCell, s.colAddress]}>Shipping Address</Text>
            <Text style={[s.headerCell, s.colDate]}>Date</Text>
            <Text style={[s.headerCell, s.colTime]}>Time Window</Text>
            <Text style={[s.headerCell, s.colTotal]}>Total</Text>
          </View>
          {rows.map((r) => (
            <View style={s.row} key={r.orderNumber} wrap={false}>
              <Text style={[s.cell, s.colOrder]}>{r.orderNumber}</Text>
              <Text style={[s.cell, s.colCustomer]}>
                {r.customerName ?? "—"}
              </Text>
              <Text style={[s.cell, s.colAddress]}>
                {fmtAddress(r.shippingAddress)}
              </Text>
              <Text style={[s.cell, s.colDate]}>
                {fmtDate(r.scheduledDeliveryDate)}
              </Text>
              <Text style={[s.cell, s.colTime]}>
                {r.scheduledDeliveryTimeLabel}
              </Text>
              <Text style={[s.cell, s.colTotal]}>{fmtMoney(r.total)}</Text>
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
