import { useState } from "react";
import { ChevronDown, ChevronRight, History as HistoryIcon } from "lucide-react";
import {
  useAdminListHistory,
  getAdminListHistoryQueryKey,
  type EntityHistoryEntry,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type HistoryPanelProps = {
  entityType: string;
  entityId: number | string | null | undefined;
  title?: string;
  pageSize?: number;
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function changeTypeBadge(t: EntityHistoryEntry["changeType"]): string {
  switch (t) {
    case "create":
      return "bg-green-100 text-green-800";
    case "update":
      return "bg-blue-100 text-blue-800";
    case "delete":
      return "bg-red-100 text-red-800";
    case "replace":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function HistoryRow({ row }: { row: EntityHistoryEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-md">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${changeTypeBadge(row.changeType)}`}
            >
              {row.changeType}
            </span>
            <span className="text-sm text-muted-foreground">
              {fmtTime(row.createdAt)}
            </span>
            {row.changedByEmail ? (
              <span className="text-sm font-medium ml-2 truncate">
                {row.changedByEmail}
              </span>
            ) : row.changedByUserId != null ? (
              <span className="text-sm font-medium ml-2 truncate">
                user #{row.changedByUserId}
              </span>
            ) : null}
            {row.notes ? (
              <span className="text-xs text-muted-foreground ml-2 truncate">
                {row.notes}
              </span>
            ) : null}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3">
            {row.previousSnapshot !== undefined &&
            row.previousSnapshot !== null ? (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Previous
                </div>
                <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-64">
                  {JSON.stringify(row.previousSnapshot, null, 2)}
                </pre>
              </div>
            ) : null}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                Snapshot
              </div>
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-64">
                {JSON.stringify(row.snapshot, null, 2)}
              </pre>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function HistoryPanel({
  entityType,
  entityId,
  title = "Edit history",
  pageSize = 25,
}: HistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const idNum =
    typeof entityId === "number"
      ? entityId
      : typeof entityId === "string" && entityId !== ""
        ? Number(entityId)
        : NaN;
  const hasId = Number.isFinite(idNum);
  const enabled = open && hasId;

  const queryParams = {
    entityType,
    ...(hasId ? { entityId: idNum } : {}),
    page,
    pageSize,
  };
  const list = useAdminListHistory(queryParams, {
    query: {
      enabled,
      queryKey: getAdminListHistoryQueryKey(queryParams),
    },
  });

  const total = list.data?.total ?? 0;
  const rows = list.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-md">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <HistoryIcon className="h-4 w-4" />
            <span className="text-sm font-medium">{title}</span>
            {open && total > 0 ? (
              <span className="text-xs text-muted-foreground">
                ({total} {total === 1 ? "entry" : "entries"})
              </span>
            ) : null}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            {!hasId ? (
              <div className="text-sm text-muted-foreground py-2">
                History is available after the record is saved.
              </div>
            ) : list.isLoading ? (
              <div className="flex items-center gap-2 py-4">
                <Spinner /> <span className="text-sm">Loading history…</span>
              </div>
            ) : list.isError ? (
              <div className="text-sm text-destructive py-2">
                Failed to load history.
              </div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                No history yet.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {rows.map((r) => (
                    <HistoryRow key={r.id} row={r} />
                  ))}
                </div>
                {totalPages > 1 ? (
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-muted-foreground">
                      Page {page} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
