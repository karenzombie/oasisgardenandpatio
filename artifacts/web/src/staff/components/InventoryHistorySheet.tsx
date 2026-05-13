import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  useAdminListInventoryAdjustments,
  type AdminInventoryItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  cycle_count: "Cycle count",
  damage: "Damage",
  loss: "Loss / Theft",
  found: "Found",
  transfer: "Transfer",
  return: "Customer return",
  manual_correction: "Manual correction",
  sold: "Sale",
  vendor_receipt: "Vendor receipt",
  other: "Other",
};

function typeLabel(value: string): string {
  return TYPE_LABELS[value] ?? value.replace(/_/g, " ");
}

function typeBadge(value: string) {
  if (value === "sold") {
    return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 font-normal text-xs">{typeLabel(value)}</Badge>;
  }
  if (value === "vendor_receipt") {
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal text-xs">{typeLabel(value)}</Badge>;
  }
  if (value === "damage" || value === "loss") {
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 font-normal text-xs">{typeLabel(value)}</Badge>;
  }
  if (value === "found" || value === "return") {
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 font-normal text-xs">{typeLabel(value)}</Badge>;
  }
  return <Badge variant="secondary" className="font-normal text-xs">{typeLabel(value)}</Badge>;
}

interface Props {
  item: AdminInventoryItem | null;
  onClose: () => void;
}

export function InventoryHistorySheet({ item, onClose }: Props) {
  const [page, setPage] = useState(1);

  const params = useMemo(() => {
    if (!item) return undefined;
    return {
      productId: item.productId,
      ...(item.variantId != null && { variantId: item.variantId }),
      ...(item.fabricId != null && { fabricId: item.fabricId }),
      page,
      pageSize: PAGE_SIZE,
    };
  }, [item, page]);

  const query = useAdminListInventoryAdjustments(params, {
    query: { enabled: !!item, queryKey: ["/api/admin/inventory/adjustments", params] as const },
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const skuLine = [item?.variantName, item?.fabricName].filter(Boolean).join(" · ");

  return (
    <Sheet
      open={!!item}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setPage(1);
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle className="text-base font-semibold leading-snug">
            Inventory History
          </SheetTitle>
          {item && (
            <SheetDescription asChild>
              <div className="space-y-1">
                <div className="font-medium text-slate-800 text-sm">
                  {item.name}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {item.sku}
                  {skuLine && <span className="font-sans ml-2 text-slate-400">{skuLine}</span>}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs text-slate-600">
                    On hand: <strong className="text-slate-900">{item.onHand}</strong>
                  </span>
                  {item.onOrder > 0 && (
                    <span className="text-xs text-slate-600">
                      On order: <strong className="text-slate-900">{item.onOrder}</strong>
                    </span>
                  )}
                </div>
              </div>
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {query.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : query.isError ? (
            <div className="p-6 text-sm text-rose-600">Failed to load history.</div>
          ) : !query.data || query.data.adjustments.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No inventory changes recorded yet for this item.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500 sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Event</th>
                  <th className="px-4 py-3 font-semibold text-right">Change</th>
                  <th className="px-4 py-3 font-semibold text-right">After</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {query.data.adjustments.map((a) => {
                  const isPositive = a.quantityChange > 0;
                  const isZero = a.quantityChange === 0;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50 align-top">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {new Date(a.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        <div className="text-slate-400">
                          {new Date(a.createdAt).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {typeBadge(a.adjustmentType)}
                        {a.reason && (
                          <div className="text-xs text-slate-500 mt-1 max-w-[140px] truncate" title={a.reason}>
                            {a.reason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap">
                        <span className={
                          isZero
                            ? "text-slate-400"
                            : isPositive
                              ? "text-emerald-600"
                              : "text-rose-600"
                        }>
                          <span className="inline-flex items-center gap-0.5">
                            {isZero ? (
                              <Minus className="size-3" />
                            ) : isPositive ? (
                              <TrendingUp className="size-3" />
                            ) : (
                              <TrendingDown className="size-3" />
                            )}
                            {isPositive ? "+" : ""}{a.quantityChange}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {a.quantityAfter ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {a.orderNumber && (
                          <div>
                            Order:{" "}
                            <span className="font-mono">{a.orderNumber}</span>
                          </div>
                        )}
                        {a.vendorOrderNumber && (
                          <div>
                            PO:{" "}
                            <span className="font-mono">{a.vendorOrderNumber}</span>
                          </div>
                        )}
                        {a.locationName && (
                          <div className="text-slate-400">{a.locationName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {a.performedByName ?? <span className="text-slate-400">System</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50 text-sm text-slate-600 shrink-0">
            <div>{total} total change{total !== 1 ? "s" : ""}</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="tabular-nums text-xs">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
