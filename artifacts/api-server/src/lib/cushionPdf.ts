import { renderToBuffer } from "@react-pdf/renderer";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { createElement } from "react";
import type { CushionOrder } from "@workspace/db";

export interface PdfItem {
  id: number;
  cushionType: string | null;
  quantity: number;
  measurementA: string | null;
  measurementB: string | null;
  measurementC: string | null;
  measurementD: string | null;
  measurementE: string | null;
  measurementF: string | null;
  thickness: string | null;
  productId: number | null;
  productNameSnapshot: string | null;
  productSkuSnapshot: string | null;
  fabricName: string | null;
  fabricItemNumber: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  hinged_chaise: "Hinged Chaise / Chair",
  club_chair: "Club Chair (Seat & Back)",
  trapezoid: "Trapezoid Seat",
  bench: "Bench",
  ottoman: "Ottoman",
  dining_chair: "Dining Chair",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  brand: { fontSize: 18, textAlign: "center", color: "#1a3c5e", fontFamily: "Helvetica-Bold" },
  brandSub: { fontSize: 10, textAlign: "center", color: "#5b8a72", marginBottom: 12 },
  title: { fontSize: 16, textAlign: "center", marginBottom: 12, fontFamily: "Helvetica-Bold" },
  hr: { borderBottomWidth: 1, borderBottomColor: "#cccccc", marginVertical: 8 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  metaCol: { flexDirection: "column" },
  metaLabel: { fontSize: 9, color: "#666666" },
  metaVal: { fontSize: 11, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  sectionHead: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#eef2ee",
    padding: 6,
    marginTop: 12,
    marginBottom: 6,
  },
  table: { borderWidth: 1, borderColor: "#333333", marginTop: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc" },
  trLast: { flexDirection: "row" },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    padding: 4,
    backgroundColor: "#f3f1ec",
    borderRightWidth: 1,
    borderRightColor: "#cccccc",
  },
  td: { fontSize: 9, padding: 4, borderRightWidth: 1, borderRightColor: "#cccccc" },
  cellName: { width: "26%" },
  cellMeasure: { width: "9%", textAlign: "center" },
  cellQty: { width: "10%", textAlign: "center" },
  optsRow: { flexDirection: "row", marginTop: 8 },
  optsCol: { flex: 1, paddingRight: 12 },
  optLine: { flexDirection: "row", marginBottom: 4 },
  optLabel: { fontFamily: "Helvetica-Bold", width: 110, fontSize: 10 },
  optVal: { fontSize: 10, flex: 1 },
  selected: { fontFamily: "Helvetica-Bold", color: "#1a3c5e" },
  notes: { fontSize: 9, padding: 6, backgroundColor: "#fafaf6", marginTop: 6 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    fontSize: 8,
    color: "#666666",
    textAlign: "center",
  },
  stockTr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc" },
  stockCellName: { width: "44%" },
  stockCellSku: { width: "16%", textAlign: "center" },
  stockCellFabric: { width: "30%" },
  stockCellQty: { width: "10%", textAlign: "center" },
});

function fmtMeas(v: string | null | undefined): string {
  if (v == null) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(n % 1 === 0 ? 0 : 2);
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function optDisplay(value: string | null): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface RenderArgs {
  order: CushionOrder;
  items: PdfItem[];
  productNameById: Map<number, { name: string; sku: string }>;
}

function buildDoc({ order, items, productNameById }: RenderArgs) {
  const isCustom = order.orderKind === "custom";

  return createElement(
    Document,
    {},
    createElement(
      Page,
      { size: "LETTER", style: styles.page },
      createElement(Text, { style: styles.brand }, "OASIS"),
      createElement(Text, { style: styles.brandSub }, "Garden & Patio"),
      createElement(
        Text,
        { style: styles.title },
        isCustom ? "Custom Cushion Order" : "Replacement Cushion Order",
      ),
      createElement(
        View,
        { style: styles.metaRow },
        createElement(
          View,
          { style: styles.metaCol },
          createElement(Text, { style: styles.metaLabel }, "Order Number"),
          createElement(Text, { style: styles.metaVal }, order.orderNumber),
          createElement(Text, { style: styles.metaLabel }, "Date Submitted"),
          createElement(Text, { style: styles.metaVal }, fmtDate(order.submittedAt)),
        ),
        createElement(
          View,
          { style: styles.metaCol },
          createElement(Text, { style: styles.metaLabel }, "Customer"),
          createElement(Text, { style: styles.metaVal }, order.customerName),
          createElement(Text, { style: styles.metaLabel }, "Phone / Email"),
          createElement(
            Text,
            { style: styles.metaVal },
            [order.customerPhone, order.customerEmail].filter(Boolean).join(" · ") || "—",
          ),
        ),
      ),
      isCustom
        ? createElement(CustomBody, { items })
        : createElement(StockBody, { items, productNameById }),
      isCustom
        ? createElement(OptionsBlock, { order })
        : null,
      order.customerNotes
        ? createElement(
            View,
            null,
            createElement(Text, { style: styles.sectionHead }, "Customer Notes"),
            createElement(Text, { style: styles.notes }, order.customerNotes),
          )
        : null,
      createElement(
        Text,
        { style: styles.footer },
        `Oasis Garden & Patio · 21182 Centre Pointe Pkwy #100, Santa Clarita, CA 91350 · (661) 255-9909 · oasisgardenandpatio.com — Order ${order.orderNumber} · Generated ${fmtDate(new Date())}`,
      ),
    ),
  );
}

function CustomBody({ items }: { items: PdfItem[] }) {
  const headers = ["Cushion Type", "(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "Thick.", "Qty"];
  return createElement(
    View,
    null,
    createElement(Text, { style: styles.sectionHead }, "Measurements"),
    createElement(
      View,
      { style: styles.table },
      createElement(
        View,
        { style: styles.tr },
        ...headers.map((h, i) =>
          createElement(
            Text,
            {
              key: h,
              style: [
                styles.th,
                i === 0 ? styles.cellName : i === headers.length - 1 ? styles.cellQty : styles.cellMeasure,
              ],
            },
            h,
          ),
        ),
      ),
      ...items.map((it, idx) =>
        createElement(
          View,
          { key: it.id, style: idx === items.length - 1 ? styles.trLast : styles.tr },
          createElement(
            Text,
            { style: [styles.td, styles.cellName] },
            it.cushionType ? (TYPE_LABELS[it.cushionType] ?? it.cushionType) : "—",
          ),
          createElement(Text, { style: [styles.td, styles.cellMeasure] }, fmtMeas(it.measurementA)),
          createElement(Text, { style: [styles.td, styles.cellMeasure] }, fmtMeas(it.measurementB)),
          createElement(Text, { style: [styles.td, styles.cellMeasure] }, fmtMeas(it.measurementC)),
          createElement(Text, { style: [styles.td, styles.cellMeasure] }, fmtMeas(it.measurementD)),
          createElement(Text, { style: [styles.td, styles.cellMeasure] }, fmtMeas(it.measurementE)),
          createElement(Text, { style: [styles.td, styles.cellMeasure] }, fmtMeas(it.measurementF)),
          createElement(Text, { style: [styles.td, styles.cellMeasure] }, fmtMeas(it.thickness)),
          createElement(Text, { style: [styles.td, styles.cellQty] }, String(it.quantity)),
        ),
      ),
    ),
  );
}

function StockBody({
  items,
  productNameById,
}: {
  items: PdfItem[];
  productNameById: Map<number, { name: string; sku: string }>;
}) {
  return createElement(
    View,
    null,
    createElement(Text, { style: styles.sectionHead }, "Replacement Cushion Items"),
    createElement(
      View,
      { style: styles.table },
      createElement(
        View,
        { style: styles.tr },
        createElement(Text, { style: [styles.th, styles.stockCellName] }, "Product"),
        createElement(Text, { style: [styles.th, styles.stockCellSku] }, "SKU"),
        createElement(Text, { style: [styles.th, styles.stockCellFabric] }, "Fabric"),
        createElement(Text, { style: [styles.th, styles.stockCellQty] }, "Qty"),
      ),
      ...items.map((it, idx) => {
        // Prefer snapshot fields so historical PDFs remain stable when
        // catalog products are renamed/edited; fall back to live catalog
        // only if the snapshot was never captured.
        const prod = it.productId ? productNameById.get(it.productId) : undefined;
        const name = it.productNameSnapshot ?? prod?.name ?? "—";
        const sku = it.productSkuSnapshot ?? prod?.sku ?? "";
        const fabric = [it.fabricName, it.fabricItemNumber ? `#${it.fabricItemNumber}` : null]
          .filter(Boolean)
          .join(" ");
        return createElement(
          View,
          { key: it.id, style: idx === items.length - 1 ? styles.trLast : styles.stockTr },
          createElement(Text, { style: [styles.td, styles.stockCellName] }, name),
          createElement(Text, { style: [styles.td, styles.stockCellSku] }, sku),
          createElement(Text, { style: [styles.td, styles.stockCellFabric] }, fabric || "—"),
          createElement(Text, { style: [styles.td, styles.stockCellQty] }, String(it.quantity)),
        );
      }),
    ),
  );
}

function OptionsBlock({ order }: { order: CushionOrder }) {
  const fabricLine = [
    order.fabricName ?? "—",
    order.fabricItemNumber ? `#${order.fabricItemNumber}` : null,
  ]
    .filter(Boolean)
    .join("  ");

  const left: Array<[string, string]> = [
    ["Fabric Name / #", fabricLine],
    ["Contrasting Fabric", order.contrastingFabricName ?? "—"],
    ["Ties", optDisplay(order.ties)],
    ["Seat (Bottom) Welt", optDisplay(order.seatWelt)],
  ];
  const right: Array<[string, string]> = [
    ["Back (Top) Welt", optDisplay(order.backWelt)],
    ["Buttons", optDisplay(order.buttons)],
    ["Tuft", optDisplay(order.tuft)],
    ["Template Available", optDisplay(order.templateAvailable)],
  ];

  function renderCol(rows: Array<[string, string]>) {
    return createElement(
      View,
      { style: styles.optsCol },
      ...rows.map(([k, v]) =>
        createElement(
          View,
          { key: k, style: styles.optLine },
          createElement(Text, { style: styles.optLabel }, `${k}:`),
          createElement(
            Text,
            { style: [styles.optVal, v && v !== "—" ? styles.selected : {}] },
            v,
          ),
        ),
      ),
    );
  }

  return createElement(
    View,
    null,
    createElement(Text, { style: styles.sectionHead }, "Fabric & Options"),
    createElement(View, { style: styles.optsRow }, renderCol(left), renderCol(right)),
  );
}

export async function renderCushionOrderPdf(args: RenderArgs): Promise<Buffer> {
  return await renderToBuffer(buildDoc(args));
}
