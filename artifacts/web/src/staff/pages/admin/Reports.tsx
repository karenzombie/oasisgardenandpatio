import { useMemo, useState } from "react";
import { Download, BarChart3, Users } from "lucide-react";
import {
  useAdminReportsSalesSummary,
  useAdminReportsSalesByAgent,
  useAdminReportsSalesByManufacturer,
  useAdminReportsSalesByCategory,
  useAdminReportsVisitorFunnel,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PageBody, PageHeader } from "../../StaffShell";

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function toDateInput(d: Date): string {
  // YYYY-MM-DD in local time, suitable for <input type="date">
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDayIso(local: string): string {
  // Interpret YYYY-MM-DD as 00:00 local, send as ISO.
  const d = new Date(`${local}T00:00:00`);
  return d.toISOString();
}

function endOfDayIso(local: string): string {
  const d = new Date(`${local}T23:59:59.999`);
  return d.toISOString();
}

async function downloadCsv(
  endpoint: "sales-by-agent" | "sales-by-manufacturer" | "sales-by-category",
  params: { dateFrom: string; dateTo: string; includeCanceled: boolean },
  filename: string,
): Promise<void> {
  const qs = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    includeCanceled: String(params.includeCanceled),
    format: "csv",
  });
  const res = await fetch(`/api/admin/reports/${endpoint}?${qs.toString()}`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [from, setFrom] = useState<string>(toDateInput(monthAgo));
  const [to, setTo] = useState<string>(toDateInput(today));
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [applied, setApplied] = useState({
    dateFrom: startOfDayIso(toDateInput(monthAgo)),
    dateTo: endOfDayIso(toDateInput(today)),
    includeCanceled: false,
  });

  const params = useMemo(
    () => ({
      dateFrom: applied.dateFrom,
      dateTo: applied.dateTo,
      includeCanceled: applied.includeCanceled,
    }),
    [applied],
  );

  const summary = useAdminReportsSalesSummary(params);
  const byAgent = useAdminReportsSalesByAgent(params);
  const byManufacturer = useAdminReportsSalesByManufacturer(params);
  const byCategory = useAdminReportsSalesByCategory(params);
  const visitorFunnel = useAdminReportsVisitorFunnel({
    dateFrom: applied.dateFrom,
    dateTo: applied.dateTo,
  });

  // The CSV-capable endpoints have a union response type (JSON | string).
  // We never request CSV via the hooks, so we know the runtime shape is JSON.
  function asObj<T>(d: T | string | undefined): T | undefined {
    return typeof d === "string" || d === undefined ? undefined : d;
  }
  const agentData = asObj(byAgent.data);
  const manufacturerData = asObj(byManufacturer.data);
  const categoryData = asObj(byCategory.data);

  function applyFilters() {
    setApplied({
      dateFrom: startOfDayIso(from),
      dateTo: endOfDayIso(to),
      includeCanceled,
    });
  }

  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Sales totals across a date range. Excludes cancelled and refunded orders unless toggled. Gross totals include tax and delivery; the per-vendor and per-category tables show product revenue only (net of line discounts)."
      />
      <PageBody>
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 pt-6">
            <div className="flex flex-col gap-1">
              <Label htmlFor="report-from">From</Label>
              <Input
                id="report-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="report-to">To</Label>
              <Input
                id="report-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-44"
              />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Checkbox
                checked={includeCanceled}
                onCheckedChange={(v) => setIncludeCanceled(v === true)}
              />
              Include cancelled & refunded
            </label>
            <Button onClick={applyFilters}>Apply</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <Spinner />
            ) : summary.isError ? (
              <p className="text-sm text-destructive">
                Failed to load summary.
              </p>
            ) : s ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Orders" value={fmtInt(s.orderCount)} />
                <Stat label="Items sold" value={fmtInt(s.itemCount)} />
                <Stat
                  label="Gross collected (incl. tax + delivery)"
                  value={fmtMoney(s.grossRevenue)}
                />
                <Stat
                  label="Average order"
                  value={fmtMoney(s.averageOrderValue)}
                />
                <Stat
                  label="Product subtotal"
                  value={fmtMoney(s.subtotal)}
                />
                <Stat label="Tax" value={fmtMoney(s.taxTotal)} />
                <Stat label="Delivery" value={fmtMoney(s.deliveryTotal)} />
                <Stat label="Discounts" value={fmtMoney(s.discountTotal)} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <ReportTable
          title="Sales by agent"
          headers={[
            "Agent",
            "Orders",
            "Items",
            "Gross collected",
            "Avg order",
          ]}
          isLoading={byAgent.isLoading}
          isError={byAgent.isError}
          rows={(agentData?.rows ?? []).map((r) => [
            r.agentEmail ?? "(unassigned)",
            fmtInt(r.orderCount),
            fmtInt(r.itemCount),
            fmtMoney(r.grossRevenue),
            fmtMoney(r.averageOrderValue),
          ])}
          numericFromIndex={1}
          onDownload={() =>
            downloadCsv("sales-by-agent", params, "sales-by-agent.csv")
          }
        />

        <ReportTable
          title="Sales by vendor"
          headers={["Vendor", "Orders", "Items", "Product revenue"]}
          isLoading={byManufacturer.isLoading}
          isError={byManufacturer.isError}
          rows={(manufacturerData?.rows ?? []).map((r) => [
            r.manufacturerName ?? "(no vendor)",
            fmtInt(r.orderCount),
            fmtInt(r.itemCount),
            fmtMoney(r.revenue),
          ])}
          numericFromIndex={1}
          onDownload={() =>
            downloadCsv(
              "sales-by-manufacturer",
              params,
              "sales-by-vendor.csv",
            )
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Visitor funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Tracks unique anonymous visitors landing on the site, how many
              were prompted to log in or create an account (when they tried to
              place a cushion order, check out, or open their account), and
              how many completed sign-up or sign-in vs. left without doing so.
            </p>
            {visitorFunnel.isLoading ? (
              <Spinner />
            ) : visitorFunnel.isError ? (
              <p className="text-sm text-destructive">
                Failed to load visitor funnel.
              </p>
            ) : visitorFunnel.data ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                  <Stat
                    label="Visitors"
                    value={fmtInt(visitorFunnel.data.totals.visitors)}
                  />
                  <Stat
                    label="Account prompts shown"
                    value={fmtInt(visitorFunnel.data.totals.prompted)}
                  />
                  <Stat
                    label="Signed in or signed up"
                    value={fmtInt(visitorFunnel.data.totals.completed)}
                  />
                  <Stat
                    label="Left after prompt"
                    value={fmtInt(visitorFunnel.data.totals.abandoned)}
                  />
                </div>
                {visitorFunnel.data.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No visitor activity in the selected range.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-4">Date</th>
                          <th className="py-2 pr-4 text-right">Visitors</th>
                          <th className="py-2 pr-4 text-right">Prompted</th>
                          <th className="py-2 pr-4 text-right">Sign-ups</th>
                          <th className="py-2 pr-4 text-right">Logins</th>
                          <th className="py-2 pr-4 text-right">Completed</th>
                          <th className="py-2 pr-4 text-right">Left after prompt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitorFunnel.data.rows.map((r) => (
                          <tr key={r.day} className="border-b last:border-0">
                            <td className="py-2 pr-4">{r.day}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {fmtInt(r.visitors)}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {fmtInt(r.prompted)}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {fmtInt(r.signups)}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {fmtInt(r.logins)}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {fmtInt(r.completed)}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {fmtInt(r.abandoned)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        <ReportTable
          title="Sales by category"
          headers={["Category", "Orders", "Items", "Product revenue"]}
          isLoading={byCategory.isLoading}
          isError={byCategory.isError}
          rows={(categoryData?.rows ?? []).map((r) => [
            r.categoryName ?? "(uncategorized)",
            fmtInt(r.orderCount),
            fmtInt(r.itemCount),
            fmtMoney(r.revenue),
          ])}
          numericFromIndex={1}
          onDownload={() =>
            downloadCsv("sales-by-category", params, "sales-by-category.csv")
          }
        />
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

interface ReportTableProps {
  title: string;
  headers: string[];
  rows: string[][];
  isLoading: boolean;
  isError: boolean;
  numericFromIndex: number;
  onDownload: () => void | Promise<void>;
}

function ReportTable({
  title,
  headers,
  rows,
  isLoading,
  isError,
  numericFromIndex,
  onDownload,
}: ReportTableProps) {
  const [downloading, setDownloading] = useState(false);
  async function handleDownload() {
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={downloading || isLoading || rows.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          {downloading ? "Downloading…" : "Download CSV"}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No data for the selected range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {headers.map((h, i) => (
                    <th
                      key={h}
                      className={`py-2 pr-4 ${i >= numericFromIndex ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-b last:border-0">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`py-2 pr-4 ${ci >= numericFromIndex ? "text-right tabular-nums" : ""}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
