import { useMemo, useState } from "react";
import { Download, BarChart3 } from "lucide-react";
import {
  useAdminReportsSalesSummary,
  useAdminReportsSalesByAgent,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PageBody, PageHeader } from "../../StaffShell";

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n: number): string { return n.toLocaleString(); }
function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfDayIso(local: string): string { return new Date(`${local}T00:00:00`).toISOString(); }
function endOfDayIso(local: string): string { return new Date(`${local}T23:59:59.999`).toISOString(); }

async function downloadAgentCsv(
  params: { dateFrom: string; dateTo: string; includeCanceled: boolean },
  filename: string,
): Promise<void> {
  const qs = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    includeCanceled: String(params.includeCanceled),
    format: "csv",
  });
  const res = await fetch(`/api/admin/reports/sales-by-agent?${qs.toString()}`, {
    method: "GET", credentials: "include",
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
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

export default function AgentReports() {
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
    () => ({ dateFrom: applied.dateFrom, dateTo: applied.dateTo, includeCanceled: applied.includeCanceled }),
    [applied],
  );

  const summary = useAdminReportsSalesSummary(params);
  const byAgent = useAdminReportsSalesByAgent(params);

  const agentData = typeof byAgent.data === "string" || byAgent.data === undefined ? undefined : byAgent.data;

  function applyFilters() {
    setApplied({
      dateFrom: startOfDayIso(from),
      dateTo: endOfDayIso(to),
      includeCanceled,
    });
  }

  const s = summary.data;
  const [downloading, setDownloading] = useState(false);
  async function handleDownload() {
    setDownloading(true);
    try { await downloadAgentCsv(params, "sales-by-agent.csv"); } finally { setDownloading(false); }
  }

  return (
    <>
      <PageHeader title="My Reports" subtitle="Sales totals over a date range. Numbers reflect orders you created." />
      <PageBody>
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 pt-6">
            <div className="flex flex-col gap-1">
              <Label htmlFor="report-from">From</Label>
              <Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="report-to">To</Label>
              <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Checkbox checked={includeCanceled} onCheckedChange={(v) => setIncludeCanceled(v === true)} />
              Include canceled & refunded
            </label>
            <Button onClick={applyFilters}>Apply</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <Spinner />
            ) : summary.isError ? (
              <p className="text-sm text-destructive">Failed to load summary.</p>
            ) : s ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Orders" value={fmtInt(s.orderCount)} />
                <Stat label="Items sold" value={fmtInt(s.itemCount)} />
                <Stat label="Gross collected (incl. tax + delivery)" value={fmtMoney(s.grossRevenue)} />
                <Stat label="Average order" value={fmtMoney(s.averageOrderValue)} />
                <Stat label="Product subtotal" value={fmtMoney(s.subtotal)} />
                <Stat label="Tax" value={fmtMoney(s.taxTotal)} />
                <Stat label="Delivery" value={fmtMoney(s.deliveryTotal)} />
                <Stat label="Discounts" value={fmtMoney(s.discountTotal)} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>My sales</CardTitle>
            <Button variant="outline" size="sm" onClick={handleDownload}
              disabled={downloading || byAgent.isLoading || (agentData?.rows?.length ?? 0) === 0}>
              <Download className="h-4 w-4 mr-2" />
              {downloading ? "Downloading…" : "Download CSV"}
            </Button>
          </CardHeader>
          <CardContent>
            {byAgent.isLoading ? (
              <Spinner />
            ) : byAgent.isError ? (
              <p className="text-sm text-destructive">Failed to load.</p>
            ) : (agentData?.rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No data for the selected range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4">Agent</th>
                      <th className="py-2 pr-4 text-right">Orders</th>
                      <th className="py-2 pr-4 text-right">Items</th>
                      <th className="py-2 pr-4 text-right">Gross collected</th>
                      <th className="py-2 pr-4 text-right">Avg order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(agentData?.rows ?? []).map((r, ri) => (
                      <tr key={ri} className="border-b last:border-0">
                        <td className="py-2 pr-4">{r.agentEmail ?? "(unassigned)"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmtInt(r.orderCount)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmtInt(r.itemCount)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmtMoney(r.grossRevenue)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmtMoney(r.averageOrderValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
