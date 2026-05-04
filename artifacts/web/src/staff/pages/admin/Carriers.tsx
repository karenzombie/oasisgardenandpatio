import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Plus, Truck } from "lucide-react";
import {
  useAdminListCarriers,
  useAdminCreateCarrier,
  useAdminUpdateCarrier,
  useAdminSetCarrierActive,
  getAdminListCarriersQueryKey,
  type Carrier,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export default function Carriers() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useAdminListCarriers();
  const setActive = useAdminSetCarrierActive();
  const [editing, setEditing] = useState<Carrier | "new" | null>(null);

  async function refetch() {
    await qc.invalidateQueries({ queryKey: getAdminListCarriersQueryKey() });
  }

  async function handleToggleActive(c: Carrier, next: boolean) {
    try {
      await setActive.mutateAsync({ id: c.id, data: { isActive: next } });
      await refetch();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to update carrier.";
      toast.toast({
        title: "Could not update carrier",
        description: msg,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Carriers"
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4 mr-1.5" />
            Add carrier
          </Button>
        }
      />
      <PageBody>
        <div className="bg-white rounded-lg border overflow-x-auto">
          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : list.isError ? (
            <div className="p-6 text-sm text-rose-600">
              Failed to load carriers.
            </div>
          ) : list.data && list.data.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <Truck className="size-8 mx-auto mb-3 text-slate-300" />
              No carriers yet. Add one to start tracking shipments.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Carrier</th>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Tracking URL</th>
                  <th className="px-4 py-3 font-semibold">Active</th>
                  <th className="px-4 py-3 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(list.data ?? []).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.name}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {c.code ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.contactName || c.contactEmail || c.contactPhone ? (
                        <div className="space-y-0.5">
                          {c.contactName && (
                            <div>{c.contactName}</div>
                          )}
                          {c.contactEmail && (
                            <div className="text-xs text-slate-500">
                              {c.contactEmail}
                            </div>
                          )}
                          {c.contactPhone && (
                            <div className="text-xs text-slate-500">
                              {c.contactPhone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      {c.trackingUrlTemplate ? (
                        <code className="text-xs text-slate-600 break-all">
                          {c.trackingUrlTemplate}
                        </code>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={c.isActive}
                        onCheckedChange={(v) => handleToggleActive(c, v)}
                        aria-label={`Toggle ${c.name} active`}
                      />
                      {!c.isActive && (
                        <Badge
                          variant="outline"
                          className="ml-2 font-normal text-slate-500"
                        >
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="size-3.5 mr-1" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <CarrierDialog
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={refetch}
        />
      </PageBody>
    </>
  );
}

function CarrierDialog({
  target,
  onClose,
  onSaved,
}: {
  target: Carrier | "new" | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const createMut = useAdminCreateCarrier();
  const updateMut = useAdminUpdateCarrier();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [trackingUrlTemplate, setTrackingUrlTemplate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isEdit = target && target !== "new";

  useEffect(() => {
    if (target === "new") {
      setName("");
      setCode("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setTrackingUrlTemplate("");
      setIsActive(true);
      setError(null);
    } else if (target) {
      setName(target.name);
      setCode(target.code ?? "");
      setContactName(target.contactName ?? "");
      setContactEmail(target.contactEmail ?? "");
      setContactPhone(target.contactPhone ?? "");
      setTrackingUrlTemplate(target.trackingUrlTemplate ?? "");
      setIsActive(target.isActive);
      setError(null);
    }
  }, [target]);

  function previewTrackingUrl(): string | null {
    const tmpl = trackingUrlTemplate.trim();
    if (!tmpl) return null;
    if (!tmpl.includes("{trackingNumber}")) return null;
    return tmpl.replace(/\{trackingNumber\}/g, "1Z999AA10123456784");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const tmpl = trackingUrlTemplate.trim();
    if (tmpl && !tmpl.includes("{trackingNumber}")) {
      setError(
        "Tracking URL must contain the placeholder {trackingNumber}.",
      );
      return;
    }
    try {
      if (target && target !== "new") {
        await updateMut.mutateAsync({
          id: target.id,
          data: {
            name: name.trim(),
            code: code.trim() || null,
            contactName: contactName.trim() || null,
            contactEmail: contactEmail.trim() || null,
            contactPhone: contactPhone.trim() || null,
            trackingUrlTemplate: tmpl || null,
          },
        });
      } else {
        await createMut.mutateAsync({
          data: {
            name: name.trim(),
            code: code.trim() || null,
            contactName: contactName.trim() || null,
            contactEmail: contactEmail.trim() || null,
            contactPhone: contactPhone.trim() || null,
            trackingUrlTemplate: tmpl || null,
            isActive,
          },
        });
      }
      await onSaved();
      toast.toast({
        title: isEdit ? "Carrier updated" : "Carrier created",
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save carrier.";
      setError(msg);
    }
  }

  const open = target !== null;
  const pending = createMut.isPending || updateMut.isPending;
  const preview = previewTrackingUrl();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit carrier" : "Add carrier"}</DialogTitle>
          <DialogDescription>
            Carriers are referenced from order shipments and provide
            customer-facing tracking links.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="c-name">Name</Label>
              <Input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="c-code">Code (optional)</Label>
              <Input
                id="c-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. UPS, FEDEX"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="c-contactName">Contact name</Label>
            <Input
              id="c-contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="c-contactEmail">Contact email</Label>
              <Input
                id="c-contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="c-contactPhone">Contact phone</Label>
              <Input
                id="c-contactPhone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="c-tracking">Tracking URL template</Label>
            <Input
              id="c-tracking"
              value={trackingUrlTemplate}
              onChange={(e) => setTrackingUrlTemplate(e.target.value)}
              placeholder="https://example.com/track?n={trackingNumber}"
            />
            <div className="mt-1.5 text-xs text-slate-500">
              Use{" "}
              <code className="bg-slate-100 px-1 rounded">
                {"{trackingNumber}"}
              </code>{" "}
              as the placeholder for the shipment's tracking number.
            </div>
            {preview && (
              <div className="mt-1.5 text-xs text-slate-600 flex items-start gap-1.5">
                <ExternalLink className="size-3 mt-0.5 shrink-0" />
                <span className="break-all">Preview: {preview}</span>
              </div>
            )}
          </div>
          {!isEdit && (
            <div className="flex items-center justify-between">
              <Label htmlFor="c-active">Active on creation</Label>
              <Switch
                id="c-active"
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
                  : "Create carrier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
