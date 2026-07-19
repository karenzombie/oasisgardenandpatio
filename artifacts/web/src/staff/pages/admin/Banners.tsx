import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useAdminListBanners,
  useAdminCreateBanner,
  useAdminUpdateBanner,
  useAdminSetBannerActive,
  useAdminDeleteBanner,
  getAdminListBannersQueryKey,
  type AdminBanner,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

const STYLE_GREEN = "#5C8A72";
const STYLE_AMBER = "#C77E1E";

type NotifStyle = "standard" | "alert";
type EditingTarget = AdminBanner | { preset: "banner" | "popup" } | null;

function styleLabel(style: string | undefined): string {
  return (style ?? "standard") === "alert" ? "Alert" : "Standard";
}

function styleColor(style: string | undefined): string {
  return (style ?? "standard") === "alert" ? STYLE_AMBER : STYLE_GREEN;
}

function formatRange(b: AdminBanner): string {
  if (!b.startDate && !b.endDate) return "Always";
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
  return `${fmt(b.startDate)} → ${fmt(b.endDate)}`;
}

function isLiveNow(b: AdminBanner): boolean {
  if (!b.isActive) return false;
  const now = Date.now();
  if (b.startDate && new Date(b.startDate).getTime() > now) return false;
  if (b.endDate && new Date(b.endDate).getTime() <= now) return false;
  return true;
}

function apiErrorMsg(err: unknown, fallback: string): string {
  const apiMsg = (err as { data?: { error?: string } | null }).data?.error;
  return apiMsg ?? (err instanceof Error ? err.message : fallback);
}

function StatusCell({ b }: { b: AdminBanner }) {
  return (
    <div className="flex items-center gap-2">
      {isLiveNow(b) ? (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal">
          Live
        </Badge>
      ) : b.isActive ? (
        <Badge variant="outline" className="font-normal text-amber-700 border-amber-300">
          Scheduled
        </Badge>
      ) : (
        <Badge variant="outline" className="font-normal text-slate-500">
          Off
        </Badge>
      )}
    </div>
  );
}

export default function Banners() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useAdminListBanners();
  const setActive = useAdminSetBannerActive();
  const deleteMut = useAdminDeleteBanner();
  const [editing, setEditing] = useState<EditingTarget>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function refetch() {
    await qc.invalidateQueries({ queryKey: getAdminListBannersQueryKey() });
  }

  async function handleToggle(b: AdminBanner, next: boolean) {
    try {
      await setActive.mutateAsync({ id: b.id, data: { isActive: next } });
      await refetch();
    } catch (err: unknown) {
      toast.toast({
        title: "Could not update",
        description: apiErrorMsg(err, "Failed to update"),
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (deletingId === null) return;
    try {
      await deleteMut.mutateAsync({ id: deletingId });
      await refetch();
      toast.toast({ title: "Deleted" });
    } catch (err: unknown) {
      toast.toast({
        title: "Could not delete",
        description: apiErrorMsg(err, "Failed to delete"),
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }

  const banners = (list.data ?? []).filter((b) => b.type === "banner");
  const popups = (list.data ?? []).filter((b) => b.type === "popup");

  const loadingState = list.isLoading ? (
    <div className="p-12 flex justify-center">
      <Spinner />
    </div>
  ) : list.isError ? (
    <div className="p-6 text-sm text-rose-600">Failed to load.</div>
  ) : null;

  return (
    <>
      <PageHeader title="Site Notifications" />
      <PageBody>
        <div className="space-y-8">

          {/* ── Banners section ── */}
          <div className="bg-white rounded-lg border overflow-x-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold text-slate-800">Banners</h2>
              <Button size="sm" onClick={() => setEditing({ preset: "banner" })}>
                <Plus className="size-4 mr-1.5" />
                Add banner
              </Button>
            </div>
            {loadingState ?? (
              banners.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  <Megaphone className="size-8 mx-auto mb-3 text-slate-300" />
                  No banners yet. Create one to display a site-wide notice.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">Schedule</th>
                      <th className="px-4 py-3 font-semibold">Order</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {banners.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{b.title}</div>
                          <div className="text-xs text-slate-500 line-clamp-2 max-w-md">
                            {b.messageText}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{formatRange(b)}</td>
                        <td className="px-4 py-3 text-slate-600">{b.displayOrder}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={b.isActive}
                              onCheckedChange={(v) => handleToggle(b, v)}
                              aria-label={`Toggle ${b.title}`}
                            />
                            <StatusCell b={b} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => setEditing(b)}>
                              <Pencil className="size-3.5 mr-1" />
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setDeletingId(b.id)}>
                              <Trash2 className="size-3.5 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* ── Pop-Ups section ── */}
          <div className="bg-white rounded-lg border overflow-x-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold text-slate-800">Pop-Ups</h2>
              <Button size="sm" onClick={() => setEditing({ preset: "popup" })}>
                <Plus className="size-4 mr-1.5" />
                Add pop-up
              </Button>
            </div>
            {loadingState ?? (
              popups.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  <Megaphone className="size-8 mx-auto mb-3 text-slate-300" />
                  No pop-ups yet. Create one to show a home-page overlay.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">Style</th>
                      <th className="px-4 py-3 font-semibold">Schedule</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {popups.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{b.title}</div>
                          <div className="text-xs text-slate-500 line-clamp-2 max-w-md">
                            {b.messageText}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block size-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: styleColor(b.style) }}
                            />
                            <span className="text-slate-700">{styleLabel(b.style)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{formatRange(b)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={b.isActive}
                              onCheckedChange={(v) => handleToggle(b, v)}
                              aria-label={`Toggle ${b.title}`}
                            />
                            <StatusCell b={b} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => setEditing(b)}>
                              <Pencil className="size-3.5 mr-1" />
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setDeletingId(b.id)}>
                              <Trash2 className="size-3.5 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>

        <BannerDialog
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={refetch}
        />

        <AlertDialog
          open={deletingId !== null}
          onOpenChange={(o) => { if (!o) setDeletingId(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete notification?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeletingId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteMut.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageBody>
    </>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function StyleSelector({
  value,
  onChange,
}: {
  value: NotifStyle;
  onChange: (v: NotifStyle) => void;
}) {
  const options: { value: NotifStyle; label: string; color: string }[] = [
    { value: "standard", label: "Standard", color: STYLE_GREEN },
    { value: "alert", label: "Alert", color: STYLE_AMBER },
  ];
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-md border text-sm transition-colors ${
            value === opt.value
              ? "border-slate-900 bg-slate-50 font-medium"
              : "border-slate-200 hover:border-slate-400"
          }`}
        >
          <span
            className="inline-block size-3.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: opt.color }}
          />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function BannerDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EditingTarget;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const createMut = useAdminCreateBanner();
  const updateMut = useAdminUpdateBanner();

  const [title, setTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [type, setType] = useState<"popup" | "banner">("banner");
  const [style, setStyle] = useState<NotifStyle>("standard");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isEdit = target !== null && "id" in target;

  useEffect(() => {
    if (!target) return;
    if ("preset" in target) {
      setTitle("");
      setMessageText("");
      setType(target.preset);
      setStyle("standard");
      setStartDate("");
      setEndDate("");
      setDisplayOrder(0);
      setIsActive(true);
      setError(null);
    } else {
      setTitle(target.title);
      setMessageText(target.messageText);
      setType(target.type);
      setStyle((target.style ?? "standard") as NotifStyle);
      setStartDate(toLocalInput(target.startDate));
      setEndDate(toLocalInput(target.endDate));
      setDisplayOrder(target.displayOrder);
      setIsActive(target.isActive);
      setError(null);
    }
  }, [target]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !messageText.trim()) {
      setError("Title and message are required.");
      return;
    }
    const startIso = fromLocalInput(startDate);
    const endIso = fromLocalInput(endDate);
    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      setError("End date must be after start date.");
      return;
    }
    try {
      if (isEdit && target && "id" in target) {
        await updateMut.mutateAsync({
          id: target.id,
          data: {
            title: title.trim(),
            messageText: messageText.trim(),
            type,
            style,
            startDate: startIso,
            endDate: endIso,
            ...(type === "banner" ? { displayOrder } : {}),
          },
        });
      } else {
        await createMut.mutateAsync({
          data: {
            title: title.trim(),
            messageText: messageText.trim(),
            type,
            style,
            startDate: startIso,
            endDate: endIso,
            isActive,
            ...(type === "banner" ? { displayOrder } : {}),
          },
        });
      }
      await onSaved();
      toast.toast({
        title: isEdit
          ? type === "popup" ? "Pop-up updated" : "Banner updated"
          : type === "popup" ? "Pop-up created" : "Banner created",
      });
      onClose();
    } catch (err: unknown) {
      const apiMsg = (err as { data?: { error?: string } | null }).data?.error;
      setError(apiMsg ?? (err instanceof Error ? err.message : "Failed to save"));
    }
  }

  const open = target !== null;
  const pending = createMut.isPending || updateMut.isPending;
  const isPopup = type === "popup";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? isPopup ? "Edit pop-up" : "Edit banner"
              : isPopup ? "Add pop-up" : "Add banner"}
          </DialogTitle>
          <DialogDescription>
            {isPopup
              ? "Pop-ups appear as an overlay on the home page. Leave dates blank to run indefinitely."
              : "Banners appear at the top of every page. Leave dates blank to run indefinitely."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="b-title">Title</Label>
            <Input
              id="b-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="b-message">Message</Label>
            <Textarea
              id="b-message"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={3}
            />
          </div>

          {isPopup && (
            <div>
              <Label className="mb-1.5 block">Style</Label>
              <StyleSelector value={style} onChange={setStyle} />
            </div>
          )}

          {!isPopup && (
            <div>
              <Label htmlFor="b-order">Display order</Label>
              <Input
                id="b-order"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="b-start">Starts (optional)</Label>
              <Input
                id="b-start"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="b-end">Ends (optional)</Label>
              <Input
                id="b-end"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {!isEdit && (
            <div className="flex items-center justify-between">
              <Label htmlFor="b-active">Active on creation</Label>
              <Switch
                id="b-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          )}

          {error && <div className="text-sm text-rose-600">{error}</div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : isPopup ? "Create pop-up" : "Create banner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
