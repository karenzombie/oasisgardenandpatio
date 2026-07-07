import { useState } from "react";
import { HardDrive, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
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

type BackupType = "products" | "customers";

interface BackupRun {
  id: number;
  backupType: BackupType;
  ranAt: string;
  triggeredBy: string | null;
  status: "success" | "failure";
  errorMessage: string | null;
  databaseDumpSizeBytes: number | null;
  imageCount: number | null;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }) +
    " at " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BackupPanelProps {
  title: string;
  description: string;
  buttonLabel: string;
  confirmTitle: string;
  confirmBody: string;
  lastRun: BackupRun | null;
  isLoading: boolean;
  onTrigger: () => void;
}

function BackupPanel({
  title,
  description,
  buttonLabel,
  confirmTitle,
  confirmBody,
  lastRun,
  isLoading,
  onTrigger,
}: BackupPanelProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>

      <div className="text-sm space-y-1">
        {lastRun ? (
          <>
            <div className="text-slate-700">
              Last backed up{" "}
              <span className="font-medium">{formatTimestamp(lastRun.ranAt)}</span>
            </div>
            {lastRun.triggeredBy && (
              <div className="text-slate-500 text-xs">
                Triggered by {lastRun.triggeredBy}
              </div>
            )}
            {lastRun.imageCount != null && (
              <div className="text-slate-500 text-xs">
                {lastRun.imageCount.toLocaleString()} images ·{" "}
                {formatBytes(lastRun.databaseDumpSizeBytes)} database dump
              </div>
            )}
          </>
        ) : (
          <div className="text-slate-400 italic">No backup on record</div>
        )}
      </div>

      <div className="mt-auto">
        <Button
          onClick={onTrigger}
          disabled={isLoading}
          className="bg-green-700 hover:bg-green-800 text-white w-full sm:w-auto"
        >
          {isLoading ? (
            <>
              <Spinner className="mr-2 size-4" />
              Backing up…
            </>
          ) : (
            buttonLabel
          )}
        </Button>
      </div>

      <AlertDialog open={false}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-green-700 hover:bg-green-800 text-white">
              Run Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface HistoryTableProps {
  rows: BackupRun[];
}

function HistoryTable({ rows }: HistoryTableProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Backup History</h2>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400 italic">
          No backup history yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Date / Time
                </th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Triggered By
                </th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Images
                </th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  DB Size
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-5 py-3 text-slate-700 whitespace-nowrap">
                    {formatTimestamp(row.ranAt)}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-slate-700">
                      {row.backupType === "products" ? "Products" : "Customers"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {row.triggeredBy ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    {row.status === "success" ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                        <CheckCircle className="size-3" />
                        Success
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-red-100 text-red-800 border-red-200 gap-1"
                      >
                        <XCircle className="size-3" />
                        Failed
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600">
                    {row.imageCount != null
                      ? row.imageCount.toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600">
                    {formatBytes(row.databaseDumpSizeBytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Backups() {
  const toast = useToast();
  const [confirmType, setConfirmType] = useState<BackupType | null>(null);
  const [loadingType, setLoadingType] = useState<BackupType | null>(null);

  // Placeholder state — will be replaced with real API queries after Gate 2 approval.
  const lastProducts: BackupRun | null = null;
  const lastCustomers: BackupRun | null = null;
  const history: BackupRun[] = [];

  async function runBackup(type: BackupType) {
    setConfirmType(null);
    setLoadingType(type);
    try {
      // TODO (step 6+7): wire to POST /api/admin/backup/products or /api/admin/backup/customers
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      toast.toast({
        title:
          type === "products"
            ? "Products backup complete"
            : "Customer data backup complete",
      });
    } catch (err) {
      toast.toast({
        title: "Backup failed",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Backups"
        subtitle="Export a snapshot of your data to the oasis-db-backups GitHub repository."
      />
      <PageBody>
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <BackupPanel
              title="Products Backup"
              description="Exports the full database and all product images from object storage to GitHub."
              buttonLabel="Back Up Products Now"
              confirmTitle="Back up products?"
              confirmBody="This will export the full database and all product images to GitHub. Depending on image volume this may take several minutes."
              lastRun={lastProducts}
              isLoading={loadingType === "products"}
              onTrigger={() => setConfirmType("products")}
            />
            <BackupPanel
              title="Customer Data Backup"
              description="Exports all customer, order, and transaction data to GitHub. No images included."
              buttonLabel="Back Up Customer Data Now"
              confirmTitle="Back up customer data?"
              confirmBody="This will export all customer, order, and transaction data to GitHub."
              lastRun={lastCustomers}
              isLoading={loadingType === "customers"}
              onTrigger={() => setConfirmType("customers")}
            />
          </div>

          <AlertDialog
            open={confirmType === "products"}
            onOpenChange={(o) => !o && setConfirmType(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Back up products?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will export the full database and all product images to
                  GitHub. Depending on image volume this may take several
                  minutes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => runBackup("products")}
                  className="bg-green-700 hover:bg-green-800 text-white"
                >
                  Run Backup
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={confirmType === "customers"}
            onOpenChange={(o) => !o && setConfirmType(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Back up customer data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will export all customer, order, and transaction data to
                  GitHub.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => runBackup("customers")}
                  className="bg-green-700 hover:bg-green-800 text-white"
                >
                  Run Backup
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <HistoryTable rows={history} />
        </div>
      </PageBody>
    </>
  );
}

export { formatTimestamp };
export type { BackupRun };
