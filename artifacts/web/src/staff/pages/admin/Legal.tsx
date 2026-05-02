import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, History, RotateCcw } from "lucide-react";
import {
  useAdminListLegalVersions,
  useAdminCreateLegalVersion,
  useAdminRestoreLegalVersion,
  getAdminListLegalVersionsQueryKey,
  type AdminLegalDocument,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type LegalType = "privacy_policy" | "terms_and_conditions";

const LEGAL_TYPES: Array<{ value: LegalType; label: string }> = [
  { value: "privacy_policy", label: "Privacy Policy" },
  { value: "terms_and_conditions", label: "Terms & Conditions" },
];

export default function Legal() {
  const [tab, setTab] = useState<LegalType>("privacy_policy");

  return (
    <>
      <PageHeader title="Legal Pages" />
      <PageBody>
        <Tabs value={tab} onValueChange={(v) => setTab(v as LegalType)}>
          <TabsList>
            {LEGAL_TYPES.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {LEGAL_TYPES.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-4">
              <LegalTypePanel type={t.value} label={t.label} />
            </TabsContent>
          ))}
        </Tabs>
      </PageBody>
    </>
  );
}

function LegalTypePanel({ type, label }: { type: LegalType; label: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useAdminListLegalVersions(type);
  const createMut = useAdminCreateLegalVersion();
  const restoreMut = useAdminRestoreLegalVersion();

  const [editorOpen, setEditorOpen] = useState(false);
  const [previewing, setPreviewing] = useState<AdminLegalDocument | null>(null);
  const [restoring, setRestoring] = useState<AdminLegalDocument | null>(null);

  const versions = list.data ?? [];
  const active = useMemo(() => versions.find((v) => v.isActive), [versions]);

  async function refetch() {
    await qc.invalidateQueries({
      queryKey: getAdminListLegalVersionsQueryKey(type),
    });
  }

  async function handleRestore() {
    if (!restoring) return;
    try {
      await restoreMut.mutateAsync({ type, id: restoring.id });
      await refetch();
      toast.toast({
        title: `Restored ${restoring.version}`,
        description: `It is now the active ${label}.`,
      });
      setRestoring(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to restore";
      toast.toast({
        title: "Could not restore",
        description: msg,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Currently published
            </div>
            <div className="text-base font-semibold text-slate-900">
              {active ? `${active.version}` : "No active version"}
            </div>
            {active && (
              <div className="text-xs text-slate-500 mt-0.5">
                Effective {active.effectiveDate} · Last updated{" "}
                {new Date(active.updatedAt).toLocaleString()}
              </div>
            )}
          </div>
          <Button onClick={() => setEditorOpen(true)}>
            <FileText className="size-4 mr-1.5" />
            Publish new version
          </Button>
        </div>
        {active && (
          <div className="border rounded bg-slate-50 p-3 max-h-64 overflow-auto">
            <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap">
              {active.content}
            </pre>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold text-slate-900 flex items-center gap-2">
          <History className="size-4 text-slate-400" />
          Version history
        </div>
        {list.isLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-rose-600">
            Failed to load versions.
          </div>
        ) : versions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No versions yet. Publish the first one above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Version</th>
                <th className="px-4 py-2 font-semibold">Effective</th>
                <th className="px-4 py-2 font-semibold">Published</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {versions.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{v.version}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {v.effectiveDate}
                  </td>
                  <td className="px-4 py-2 text-slate-500 text-xs">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    {v.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal">
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="font-normal text-slate-500"
                      >
                        Archived
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewing(v)}
                      >
                        <Eye className="size-3.5 mr-1" />
                        View
                      </Button>
                      {!v.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRestoring(v)}
                        >
                          <RotateCcw className="size-3.5 mr-1" />
                          Restore
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

      <PublishDialog
        open={editorOpen}
        type={type}
        label={label}
        currentContent={active?.content ?? ""}
        onClose={() => setEditorOpen(false)}
        onSaved={refetch}
        createMut={createMut}
      />

      <Dialog
        open={previewing !== null}
        onOpenChange={(o) => !o && setPreviewing(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {label} — {previewing?.version}
            </DialogTitle>
            <DialogDescription>
              Effective {previewing?.effectiveDate}
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded bg-slate-50 p-3 max-h-96 overflow-auto">
            <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap">
              {previewing?.content}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={restoring !== null}
        onOpenChange={(o) => !o && setRestoring(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoring?.version} (effective {restoring?.effectiveDate}) will
              become the active {label} immediately. The currently active
              version will be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function todayString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function PublishDialog({
  open,
  type,
  label,
  currentContent,
  onClose,
  onSaved,
  createMut,
}: {
  open: boolean;
  type: LegalType;
  label: string;
  currentContent: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  createMut: ReturnType<typeof useAdminCreateLegalVersion>;
}) {
  const toast = useToast();
  const [content, setContent] = useState("");
  const [version, setVersion] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayString());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setContent(currentContent);
      setVersion("");
      setEffectiveDate(todayString());
      setError(null);
    }
  }, [open, currentContent]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!content.trim()) {
      setError("Content cannot be empty.");
      return;
    }
    try {
      await createMut.mutateAsync({
        type,
        data: {
          content,
          version: version.trim() || undefined,
          effectiveDate: effectiveDate || undefined,
        },
      });
      await onSaved();
      toast.toast({
        title: `New ${label} published`,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to publish";
      setError(msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Publish new {label}</DialogTitle>
          <DialogDescription>
            Saving creates a new version and archives the current one. The
            customer site immediately serves the new content.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="l-version">Version (optional)</Label>
              <Input
                id="l-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="auto: v2, v3, …"
              />
            </div>
            <div>
              <Label htmlFor="l-eff">Effective date</Label>
              <Input
                id="l-eff"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="l-content">Content (Markdown)</Label>
            <Textarea
              id="l-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={18}
              className="font-mono text-sm"
            />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
