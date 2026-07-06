import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Loader2, Mail, Printer } from "lucide-react";
import {
  useAdminGetWishlist,
  getAdminGetWishlistQueryKey,
  useAdminPreviewWishlistReachOutEmail,
  useAdminSendWishlistReachOutEmail,
  type AdminWishlistStatusEvent,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageBody, PageHeader } from "../../StaffShell";
import {
  WishlistOptOutBadge,
  formatOptOutDate,
} from "../../components/WishlistOptOutBadge";

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function fmtPacificDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function fmtPacificDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
  });
}

function statusHistoryText(h: AdminWishlistStatusEvent): string {
  switch (h.eventType) {
    case "item_added":
      return `${h.productName ?? "Item"} added to wishlist`;
    case "reach_out_sent": {
      const count = h.itemCount ?? 0;
      const label = count === 1 ? `${count} item` : `${count} items`;
      const names = h.itemNames ?? [];
      const shown = names.slice(0, 3);
      const remaining = names.length - shown.length;
      const namesText =
        remaining > 0
          ? `${shown.join(", ")}, and ${remaining} more`
          : shown.join(", ");
      return `Reach-out email sent (${label}): ${namesText}`;
    }
    case "opt_out":
      return "Customer opted out of marketing contact";
    case "opt_in":
      return "Customer opted back in to marketing contact";
    default:
      return h.eventType;
  }
}

function ReachOutStatusBadge({ lastSentAt }: { lastSentAt: string | null }) {
  if (!lastSentAt) {
    return (
      <span
        className="inline-flex items-center rounded-full text-[12px] px-2 py-[3px] font-medium"
        style={{ backgroundColor: "#EEF0F3", color: "#5B6472" }}
      >
        Not sent
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full text-[12px] px-2 py-[3px] font-medium"
      style={{ backgroundColor: "#E3EEFB", color: "#1D5A9E" }}
    >
      Sent {fmtPacificDate(lastSentAt)}
    </span>
  );
}

function parseInlineStyle(styleStr: string): React.CSSProperties {
  const result: Record<string, string> = {};
  styleStr.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx === -1) return;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) return;
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camel] = value;
  });
  return result as React.CSSProperties;
}

function parseEmailPreview(html: string): {
  style: React.CSSProperties;
  innerHtml: string;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return {
    style: parseInlineStyle(doc.body.getAttribute("style") ?? ""),
    innerHtml: doc.body.innerHTML,
  };
}

export default function WishlistDetail() {
  const params = useParams<{ id: string }>();
  const customerId = Number(params.id);
  const [composeOpen, setComposeOpen] = useState(false);
  const [personalNote, setPersonalNote] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{
    customerEmail: string;
    sentAt: string;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const q = useAdminGetWishlist(customerId, {
    query: {
      queryKey: getAdminGetWishlistQueryKey(customerId),
      enabled: Number.isFinite(customerId),
    },
  });

  const previewMutation = useAdminPreviewWishlistReachOutEmail();
  const sendMutation = useAdminSendWishlistReachOutEmail();

  const parsedPreview = useMemo(
    () => (previewHtml ? parseEmailPreview(previewHtml) : null),
    [previewHtml],
  );

  const items = q.data?.items ?? [];
  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );
  const selectedItemIds = useMemo(
    () => selectedItems.map((it) => it.id),
    [selectedItems],
  );
  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  useEffect(() => {
    // Drop selections for items that no longer exist once data (re)loads.
    setSelectedIds((prev) => {
      const validIds = new Set(items.map((it) => it.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  function toggleItem(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(items.map((it) => it.id)) : new Set());
  }

  useEffect(() => {
    if (
      !composeOpen ||
      !Number.isFinite(customerId) ||
      selectedItemIds.length === 0
    )
      return;
    const timer = setTimeout(() => {
      previewMutation.mutate(
        {
          customerId,
          data: {
            personalNote: personalNote.trim() || null,
            itemIds: selectedItemIds,
          },
        },
        {
          onSuccess: (res) => setPreviewHtml(res.html),
        },
      );
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeOpen, customerId, personalNote]);

  function openCompose() {
    if (selectedItemIds.length === 0) return;
    setPersonalNote("");
    setPreviewHtml(null);
    setSendResult(null);
    previewMutation.reset();
    sendMutation.reset();
    setComposeOpen(true);
  }

  function handleSend() {
    if (!Number.isFinite(customerId) || selectedItemIds.length === 0) return;
    sendMutation.mutate(
      {
        customerId,
        data: {
          personalNote: personalNote.trim() || null,
          itemIds: selectedItemIds,
        },
      },
      {
        onSuccess: (res) => {
          setSendResult(res);
          q.refetch();
        },
      },
    );
  }

  if (q.isLoading) {
    return (
      <PageBody>
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      </PageBody>
    );
  }

  if (q.error || !q.data) {
    return (
      <PageBody>
        <div className="text-sm text-red-600">Wishlist not found.</div>
      </PageBody>
    );
  }

  const data = q.data;
  const optOutNote = data.marketingOptOut
    ? formatOptOutDate(data.marketingOptOutAt)
    : null;

  return (
    <>
      <PageHeader
        title={data.wishlistNumber}
        subtitle={`${data.customerName} · Saved ${fmtDate(data.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant={
                data.marketingOptOut || selectedIds.size === 0
                  ? "outline"
                  : "default"
              }
              disabled={data.marketingOptOut || selectedIds.size === 0}
              onClick={openCompose}
              title={
                data.marketingOptOut
                  ? "Opted out -- cannot send"
                  : selectedIds.size === 0
                    ? "Select at least one item to send"
                    : undefined
              }
            >
              <Mail className="size-4 mr-1.5" />
              {data.marketingOptOut
                ? "Opted out -- cannot send"
                : selectedIds.size === 0
                  ? "Select items to send"
                  : `Send Reach-Out Email (${selectedIds.size})`}
            </Button>
            <Button asChild variant="outline">
              <Link href={`/admin/wishlists/${customerId}/print`}>
                <Printer className="size-4 mr-1.5" />
                Print Wishlist
              </Link>
            </Button>
          </div>
        }
      />
      <PageBody>
        <Link
          href="/admin/customers?tab=wishlists"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline mb-3"
        >
          <ArrowLeft className="size-3.5" />
          Back to Wishlists
        </Link>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 mb-4">
          <div className="font-medium text-amber-900">
            WISHLIST -- This is not an order. No payment or delivery has been
            arranged.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-2 rounded-md border bg-white p-4 space-y-1">
            <div className="text-sm font-semibold text-slate-700 mb-2">
              Customer
            </div>
            <div className="text-sm">{data.customerName}</div>
            <div className="text-sm text-slate-600">{data.customerEmail}</div>
            {data.customerPhone && (
              <div className="text-sm text-slate-600">
                {data.customerPhone}
              </div>
            )}
          </div>
          <div className="rounded-md border bg-white p-4">
            <div className="text-sm font-semibold text-slate-700 mb-2">
              Marketing contact
            </div>
            <WishlistOptOutBadge optedOut={data.marketingOptOut} />
            {optOutNote && (
              <div className="text-xs text-slate-500 mt-1">{optOutNote}</div>
            )}
            {data.marketingOptOut && (
              <div className="text-xs text-slate-500 mt-2">
                This customer has opted out of marketing contact. The
                reach-out email button is disabled.
              </div>
            )}
          </div>
        </div>

        {!data.marketingOptOut && (
          <div className="text-xs text-slate-500 mb-2">
            Select the items you want to include, then send a reach-out email
            about just those pieces.
          </div>
        )}

        <div className="rounded-md border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                {!data.marketingOptOut && (
                  <th className="px-3 py-2 font-medium w-8">
                    <Checkbox
                      checked={
                        allSelected ? true : someSelected ? "indeterminate" : false
                      }
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="Select all items"
                    />
                  </th>
                )}
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Added</th>
                <th className="px-3 py-2 font-medium">Reach-out status</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">
                  Unit price
                </th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => {
                const isSelected = selectedIds.has(it.id);
                return (
                  <tr
                    key={it.id}
                    className="border-t"
                    style={
                      isSelected ? { backgroundColor: "#F4F9EE" } : undefined
                    }
                  >
                    {!data.marketingOptOut && (
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            toggleItem(it.id, checked === true)
                          }
                          aria-label={`Select ${it.description}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div>{it.description}</div>
                      {it.variantLabel && (
                        <div className="text-xs text-slate-500">
                          {it.variantLabel}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {it.sku ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {fmtPacificDate(it.addedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <ReachOutStatusBadge lastSentAt={it.lastReachOutSentAt} />
                    </td>
                    <td className="px-3 py-2 text-right">{it.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(it.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(it.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-3">
          <div className="w-full max-w-xs rounded-md border bg-white p-3 space-y-1">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Subtotal</span>
              <span>{fmtMoney(data.subtotal)}</span>
            </div>
            {data.hasUnpricedItems && (
              <div className="text-xs text-slate-500">
                Subtotal does not include items with no listed price.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border bg-white mt-4">
          <div className="px-4 py-3 border-b font-medium">Status history</div>
          <ul className="divide-y">
            {data.statusHistory.length === 0 && (
              <li className="px-4 py-3 text-sm text-slate-500">
                No activity recorded yet.
              </li>
            )}
            {data.statusHistory.map((h) => (
              <li key={h.id} className="px-4 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{statusHistoryText(h)}</span>
                  <span className="ml-auto text-xs text-slate-500 whitespace-nowrap">
                    {fmtPacificDateTime(h.createdAt)}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  by {h.staffEmail ?? "Customer"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </PageBody>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-2xl">
          {sendResult ? (
            <>
              <DialogHeader>
                <DialogTitle>Email sent</DialogTitle>
              </DialogHeader>
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
                Sent to {sendResult.customerEmail} at{" "}
                {new Date(sendResult.sentAt).toLocaleString()}.
              </div>
              <DialogFooter>
                <Button onClick={() => setComposeOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Send Reach-Out Email</DialogTitle>
                <DialogDescription>
                  Review the email below before sending. This does not create
                  an order.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-slate-500">To</div>
                    <div className="font-medium">{data.customerEmail}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Subject</div>
                    <div className="font-medium">
                      Your Oasis Garden & Patio Wishlist
                    </div>
                  </div>
                </div>

                <div className="text-sm">
                  <span className="text-slate-500">Sending about: </span>
                  <span className="font-medium">
                    {selectedItems.map((it) => it.description).join(", ")}
                  </span>
                  {" "}
                  <span className="text-slate-500">
                    ({selectedItems.length}{" "}
                    {selectedItems.length === 1 ? "item" : "items"})
                  </span>
                </div>

                <div>
                  <Label htmlFor="personal-note">
                    Personal note (optional)
                  </Label>
                  <Textarea
                    id="personal-note"
                    className="mt-1"
                    rows={3}
                    value={personalNote}
                    onChange={(e) => setPersonalNote(e.target.value)}
                    placeholder="Add a short note to include at the bottom of the email..."
                  />
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700 mb-1">
                    Preview
                  </div>
                  <div className="rounded-md border bg-slate-50 max-h-80 overflow-y-auto">
                    {previewMutation.isPending && !previewHtml ? (
                      <div className="flex items-center justify-center py-10 text-slate-500">
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        Loading preview...
                      </div>
                    ) : previewMutation.isError ? (
                      <div className="p-4 text-sm text-red-600">
                        Failed to load preview.
                      </div>
                    ) : parsedPreview ? (
                      <div
                        className="w-full h-80 overflow-y-auto bg-white"
                        style={parsedPreview.style}
                        dangerouslySetInnerHTML={{
                          __html: parsedPreview.innerHtml,
                        }}
                      />
                    ) : null}
                  </div>
                </div>

                {sendMutation.isError && (
                  <div className="text-sm text-red-600">
                    {(sendMutation.error as { message?: string })?.message ??
                      "Failed to send email."}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setComposeOpen(false)}
                  disabled={sendMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={sendMutation.isPending || !previewHtml}
                >
                  {sendMutation.isPending && (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  )}
                  Send Email
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
