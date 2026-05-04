import { useState, useMemo } from "react";
import { Search, ScrollText, Eye } from "lucide-react";
import {
  useAdminListAuditLog,
  type AuditLogEntry,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageBody, PageHeader } from "../../StaffShell";

const PAGE_SIZE = 50;

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortAction(action: string): string {
  return action.length > 60 ? `${action.slice(0, 57)}…` : action;
}

export default function AuditLog() {
  const [q, setQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const [page, setPage] = useState(0);
  const [viewing, setViewing] = useState<AuditLogEntry | null>(null);

  const params = useMemo(
    () => ({
      ...(committedQ ? { q: committedQ } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [committedQ, page],
  );

  const list = useAdminListAuditLog(params);

  const total = list.data?.total ?? 0;
  const rows = list.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setCommittedQ(q.trim());
  }

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="System-wide log of staff and admin actions."
      />
      <PageBody>
        <form
          onSubmit={applyFilter}
          className="flex items-center gap-2 mb-4 max-w-md"
        >
          <div className="relative flex-1">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search action, entity, or user email…"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {committedQ && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ("");
                setCommittedQ("");
                setPage(0);
              }}
            >
              Clear
            </Button>
          )}
        </form>

        <div className="bg-white rounded-lg border overflow-x-auto">
          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : list.isError ? (
            <div className="p-6 text-sm text-rose-600">
              Failed to load audit log.
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <ScrollText className="size-8 mx-auto mb-3 text-slate-300" />
              No audit entries match those filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">When</th>
                  <th className="text-left px-4 py-2.5 font-medium">User</th>
                  <th className="text-left px-4 py-2.5 font-medium">Action</th>
                  <th className="text-left px-4 py-2.5 font-medium">Entity</th>
                  <th className="text-left px-4 py-2.5 font-medium">IP</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                      {formatTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {row.userEmail ?? (
                        <span className="text-slate-400">system</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-800">
                      {shortAction(row.action)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {row.entityType ? (
                        <span>
                          {row.entityType}
                          {row.entityId !== null ? (
                            <span className="text-slate-400">
                              {" "}
                              #{row.entityId}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">
                      {row.ipAddress ?? "—"}
                    </td>
                    <td className="px-2 py-2.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setViewing(row)}
                        aria-label="View details"
                      >
                        <Eye className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
            <div>
              Page {page + 1} of {totalPages} · {total} total
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </PageBody>

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit entry #{viewing?.id}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-slate-500">When</div>
                <div className="col-span-2">{formatTime(viewing.createdAt)}</div>
                <div className="text-slate-500">User</div>
                <div className="col-span-2">
                  {viewing.userEmail ?? "system"}
                  {viewing.userId !== null ? (
                    <span className="text-slate-400"> (#{viewing.userId})</span>
                  ) : null}
                </div>
                <div className="text-slate-500">Action</div>
                <div className="col-span-2 font-mono">{viewing.action}</div>
                <div className="text-slate-500">Entity</div>
                <div className="col-span-2">
                  {viewing.entityType
                    ? `${viewing.entityType}${
                        viewing.entityId !== null ? ` #${viewing.entityId}` : ""
                      }`
                    : "—"}
                </div>
                <div className="text-slate-500">IP</div>
                <div className="col-span-2 font-mono text-xs">
                  {viewing.ipAddress ?? "—"}
                </div>
                <div className="text-slate-500">User agent</div>
                <div className="col-span-2 break-all text-xs text-slate-600">
                  {viewing.userAgent ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Changes</div>
                <pre className="bg-slate-50 border rounded p-3 text-xs overflow-auto max-h-72">
                  {viewing.changes
                    ? JSON.stringify(viewing.changes, null, 2)
                    : "(none)"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
