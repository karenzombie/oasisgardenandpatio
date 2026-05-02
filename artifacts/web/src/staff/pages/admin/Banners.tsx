import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useAdminListBanners,
  useAdminCreateBanner,
  useAdminUpdateBanner,
  useAdminDeleteBanner,
  useAdminSetBannerActive,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

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

export default function Banners() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useAdminListBanners();
  const setActive = useAdminSetBannerActive();
  const deleteMut = useAdminDeleteBanner();
  const [editing, setEditing] = useState<AdminBanner | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminBanner | null>(null);

  async function refetch() {
    await qc.invalidateQueries({ queryKey: getAdminListBannersQueryKey() });
  }

  async function handleToggle(b: AdminBanner, next: boolean) {
    try {
      await setActive.mutateAsync({ id: b.id, data: { isActive: next } });
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      toast.toast({
        title: "Could not update banner",
        description: msg,
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteMut.mutateAsync({ id: confirmDelete.id });
      await refetch();
      toast.toast({ title: "Banner deleted" });
      setConfirmDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      toast.toast({
        title: "Could not delete",
        description: msg,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Site Banners"
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4 mr-1.5" />
            Add banner
          </Button>
        }
      />
      <PageBody>
        <div className="bg-white rounded-lg border overflow-hidden">
          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : list.isError ? (
            <div className="p-6 text-sm text-rose-600">
              Failed to load banners.
            </div>
          ) : list.data && list.data.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <Megaphone className="size-8 mx-auto mb-3 text-slate-300" />
              No banners yet. Create one to display a site-wide notice.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Schedule</th>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(list.data ?? []).map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {b.title}
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-2 max-w-md">
                        {b.messageText}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="capitalize font-normal"
                      >
                        {b.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {formatRange(b)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {b.displayOrder}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={b.isActive}
                          onCheckedChange={(v) => handleToggle(b, v)}
                          aria-label={`Toggle ${b.title}`}
                        />
                        {isLiveNow(b) ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal">
                            Live
                          </Badge>
                        ) : b.isActive ? (
                          <Badge
                            variant="outline"
                            className="font-normal text-amber-700 border-amber-300"
                          >
                            Scheduled
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="font-normal text-slate-500"
                          >
                            Off
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(b)}
                        >
                          <Pencil className="size-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-rose-600 hover:text-rose-700"
                          onClick={() => setConfirmDelete(b)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <BannerDialog
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={refetch}
        />

        <AlertDialog
          open={confirmDelete !== null}
          onOpenChange={(o) => !o && setConfirmDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this banner?</AlertDialogTitle>
              <AlertDialogDescription>
                "{confirmDelete?.title}" will be permanently removed. To keep
                the record but hide it from the site, toggle it off instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-rose-600 hover:bg-rose-700"
              >
                Delete
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

function BannerDialog({
  target,
  onClose,
  onSaved,
}: {
  target: AdminBanner | "new" | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const createMut = useAdminCreateBanner();
  const updateMut = useAdminUpdateBanner();

  const [title, setTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [type, setType] = useState<"popup" | "banner">("banner");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isEdit = target && target !== "new";

  useEffect(() => {
    if (target === "new") {
      setTitle("");
      setMessageText("");
      setType("banner");
      setStartDate("");
      setEndDate("");
      setDisplayOrder(0);
      setIsActive(true);
      setError(null);
    } else if (target) {
      setTitle(target.title);
      setMessageText(target.messageText);
      setType(target.type);
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
      if (target && target !== "new") {
        await updateMut.mutateAsync({
          id: target.id,
          data: {
            title: title.trim(),
            messageText: messageText.trim(),
            type,
            startDate: startIso,
            endDate: endIso,
            displayOrder,
          },
        });
      } else {
        await createMut.mutateAsync({
          data: {
            title: title.trim(),
            messageText: messageText.trim(),
            type,
            startDate: startIso,
            endDate: endIso,
            displayOrder,
            isActive,
          },
        });
      }
      await onSaved();
      toast.toast({
        title: isEdit ? "Banner updated" : "Banner created",
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
    }
  }

  const open = target !== null;
  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit banner" : "Add banner"}</DialogTitle>
          <DialogDescription>
            Banners appear at the top of every page; popups overlay the
            screen on first visit. Leave dates blank to run indefinitely.
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="b-type">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as "popup" | "banner")}
              >
                <SelectTrigger id="b-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="banner">Banner (top of page)</SelectItem>
                  <SelectItem value="popup">Popup (modal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="b-order">Display order</Label>
              <Input
                id="b-order"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)}
              />
            </div>
          </div>
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
                  : "Create banner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
