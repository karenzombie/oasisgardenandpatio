import { useState } from "react";
import { Link } from "wouter";
import {
  useListCushionOrders,
  type CushionOrderListRowStatus,
} from "@workspace/api-client-react";
import { PageHeader, PageBody } from "../../StaffShell";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const STATUS_LABEL: Record<CushionOrderListRowStatus, string> = {
  submitted: "Submitted",
  in_review: "In Review",
  ordered: "Ordered",
  complete: "Complete",
};

const STATUS_VARIANT: Record<
  CushionOrderListRowStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  submitted: "default",
  in_review: "secondary",
  ordered: "outline",
  complete: "outline",
};

export default function CushionOrders() {
  const [status, setStatus] = useState<CushionOrderListRowStatus | "all">("all");
  const [q, setQ] = useState("");

  const { data, isLoading } = useListCushionOrders({
    limit: 100,
    ...(status !== "all" ? { status } : {}),
  });

  // Client-side filter on the loaded page (server doesn't support free-text
  // search yet — keep the UI affordance but apply locally).
  const allRows = data?.rows ?? [];
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? allRows.filter(
        (r) =>
          r.orderNumber.toLowerCase().includes(needle) ||
          r.customerName.toLowerCase().includes(needle) ||
          (r.customerEmail ?? "").toLowerCase().includes(needle) ||
          (r.itemSummary ?? "").toLowerCase().includes(needle),
      )
    : allRows;

  return (
    <>
      <PageHeader
        title="Cushion Orders"
        subtitle="Custom and replacement cushion submissions from the public site."
      />
      <PageBody>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input
            placeholder="Search by order # or customer"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as typeof status)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded">
            No cushion orders match your filters.
          </div>
        ) : (
          <div className="border border-border rounded-md overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Order #</th>
                  <th className="px-3 py-2 font-medium">Submitted</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Summary</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono">
                      <Link
                        href={`/admin/cushion-orders/${r.id}`}
                        className="text-foreground hover:underline"
                      >
                        {r.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(r.submittedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {r.customerName}
                      {r.customerEmail && (
                        <div className="text-xs text-muted-foreground">
                          {r.customerEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 capitalize">{r.orderKind}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.itemSummary}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
