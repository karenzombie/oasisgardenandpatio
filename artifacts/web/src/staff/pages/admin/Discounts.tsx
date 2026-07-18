import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Eye, RotateCcw } from "lucide-react";
import {
  useAdminListDiscountEvents,
  useAdminArchiveDiscountEvent,
  useAdminRestoreDiscountEvent,
  useAdminListCouponCodes,
  useAdminArchiveCouponCode,
  useAdminRestoreCouponCode,
  useAdminListCouponCodeUses,
  getAdminListDiscountEventsQueryKey,
  getAdminListCouponCodesQueryKey,
  getAdminListCouponCodeUsesQueryKey,
  type AdminDiscountEvent,
  type AdminCouponCode,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

type DiscountType = "percentage" | "fixed";

function formatDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString();
}

function describeAmount(type: DiscountType, value: number): string {
  return type === "percentage" ? `${value}% off` : `$${value.toFixed(2)} off`;
}

function ComingSoonBanner() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-amber-500">
          <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-800">Coming Soon</p>
          <p className="mt-0.5 text-sm text-amber-700">
            The Discounts feature is being finalized and is not yet active. Browsing and archiving are available; creating and editing will be enabled at launch.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Discounts() {
  const [tab, setTab] = useState<"events" | "coupons">("events");

  return (
    <>
      <PageHeader title="Discounts" />
      <PageBody>
        <ComingSoonBanner />
        <div className="border-b mb-4">
          <div className="flex gap-1">
            <button
              onClick={() => setTab("events")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "events" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              Discount events
            </button>
            <button
              onClick={() => setTab("coupons")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "coupons" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              Coupon codes
            </button>
          </div>
        </div>
        {tab === "events" ? <EventsPanel /> : <CouponsPanel />}
      </PageBody>
    </>
  );
}

// ---------------- Events ----------------

function EventsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const params = { includeArchived: showArchived || undefined };
  const list = useAdminListDiscountEvents(params);
  const archiveMut = useAdminArchiveDiscountEvent();
  const restoreMut = useAdminRestoreDiscountEvent();

  async function refetch() {
    await qc.invalidateQueries({ queryKey: getAdminListDiscountEventsQueryKey() });
  }

  async function handleArchive(e: AdminDiscountEvent) {
    try {
      await archiveMut.mutateAsync({ id: e.id });
      await refetch();
      toast.toast({ title: "Event archived" });
    } catch {
      toast.toast({ title: "Failed to archive event", variant: "destructive" });
    }
  }

  async function handleRestore(e: AdminDiscountEvent) {
    try {
      await restoreMut.mutateAsync({ id: e.id });
      await refetch();
      toast.toast({ title: "Event restored" });
    } catch {
      toast.toast({ title: "Failed to restore event", variant: "destructive" });
    }
  }

  const events = list.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded"
          />
          Show archived
        </label>
      </div>
      <div className="bg-white rounded-lg border overflow-x-auto">
        {list.isLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-rose-600">
            Failed to load events.
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No discount events yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Discount</th>
                <th className="px-4 py-2 font-semibold">Window</th>
                <th className="px-4 py-2 font-semibold">Stackable</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((e) => (
                <tr key={e.id} className={`hover:bg-slate-50 ${e.archivedAt ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {e.name}
                  </td>
                  <td className="px-4 py-2">
                    {describeAmount(e.type, e.value)}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {formatDate(e.startDate)} → {formatDate(e.endDate)}
                  </td>
                  <td className="px-4 py-2">
                    {e.isStackable ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-2">
                    {e.archivedAt ? (
                      <Badge variant="outline" className="font-normal text-slate-400">
                        Archived
                      </Badge>
                    ) : e.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal text-slate-500">
                        Off
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      {e.archivedAt ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(e)}
                          title="Restore"
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleArchive(e)}
                          title="Archive"
                        >
                          <Archive className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------- Coupons ----------------

function CouponsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [viewingUses, setViewingUses] = useState<AdminCouponCode | null>(null);

  const couponParams = { includeArchived: showArchived || undefined };
  const list = useAdminListCouponCodes(couponParams);
  const archiveMut = useAdminArchiveCouponCode();
  const restoreMut = useAdminRestoreCouponCode();

  async function refetch() {
    await qc.invalidateQueries({ queryKey: getAdminListCouponCodesQueryKey() });
  }

  async function handleArchive(c: AdminCouponCode) {
    try {
      await archiveMut.mutateAsync({ id: c.id });
      await refetch();
      toast.toast({ title: "Coupon archived" });
    } catch {
      toast.toast({ title: "Failed to archive coupon", variant: "destructive" });
    }
  }

  async function handleRestore(c: AdminCouponCode) {
    try {
      await restoreMut.mutateAsync({ id: c.id });
      await refetch();
      toast.toast({ title: "Coupon restored" });
    } catch {
      toast.toast({ title: "Failed to restore coupon", variant: "destructive" });
    }
  }

  const coupons = list.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded"
          />
          Show archived
        </label>
      </div>
      <div className="bg-white rounded-lg border overflow-x-auto">
        {list.isLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-rose-600">Failed to load coupons.</div>
        ) : coupons.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No coupon codes yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Code</th>
                <th className="px-4 py-2 font-semibold">Discount</th>
                <th className="px-4 py-2 font-semibold">Min order</th>
                <th className="px-4 py-2 font-semibold">Uses</th>
                <th className="px-4 py-2 font-semibold">Expires</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {coupons.map((c) => (
                <tr key={c.id} className={`hover:bg-slate-50 ${c.archivedAt ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-900">
                    {c.code}
                  </td>
                  <td className="px-4 py-2">
                    {describeAmount(c.discountType, c.value)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {c.minOrderAmount === null
                      ? "—"
                      : `$${c.minOrderAmount.toFixed(2)}`}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {c.currentUses}
                    {c.maxUsesTotal !== null ? ` / ${c.maxUsesTotal}` : ""}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {formatDate(c.expirationDate)}
                  </td>
                  <td className="px-4 py-2">
                    {c.archivedAt ? (
                      <Badge variant="outline" className="font-normal text-slate-400">
                        Archived
                      </Badge>
                    ) : c.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal text-slate-500">
                        Off
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewingUses(c)}
                        title="View redemptions"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      {c.archivedAt ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(c)}
                          title="Restore"
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleArchive(c)}
                          title="Archive"
                        >
                          <Archive className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <UsesDialog
        coupon={viewingUses}
        onClose={() => setViewingUses(null)}
      />
    </div>
  );
}

function UsesDialog({
  coupon,
  onClose,
}: {
  coupon: AdminCouponCode | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const couponId = coupon?.id ?? 0;
  const usesQ = useAdminListCouponCodeUses(couponId, {
    query: {
      queryKey: getAdminListCouponCodeUsesQueryKey(couponId),
      enabled: coupon !== null,
    },
  });
  const uses = usesQ.data ?? [];
  const totalDiscount = useMemo(
    () => uses.reduce((acc, u) => acc + u.discountApplied, 0),
    [uses],
  );

  useEffect(() => {
    if (coupon) {
      void qc.invalidateQueries({
        queryKey: getAdminListCouponCodeUsesQueryKey(coupon.id),
      });
    }
  }, [coupon, qc]);

  return (
    <Dialog open={coupon !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Redemptions — <span className="font-mono">{coupon?.code}</span>
          </DialogTitle>
          <DialogDescription>
            {uses.length} {uses.length === 1 ? "redemption" : "redemptions"} ·
            {" "}
            ${totalDiscount.toFixed(2)} total discount given
          </DialogDescription>
        </DialogHeader>
        <div className="border rounded max-h-96 overflow-auto">
          {usesQ.isLoading ? (
            <div className="p-6 flex justify-center">
              <Spinner />
            </div>
          ) : uses.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No redemptions yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Order</th>
                  <th className="px-3 py-2 font-semibold text-right">
                    Discount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {uses.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {new Date(u.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {u.userEmail ?? "Guest"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {u.orderNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      ${u.discountApplied.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
