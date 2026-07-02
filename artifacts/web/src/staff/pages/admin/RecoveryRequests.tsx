import { useState } from "react";
import {
  useAdminListRecoveryRequests,
  useAdminCancelRecoveryRequest,
  getAdminListRecoveryRequestsQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function fmt(s: string): string {
  return new Date(s).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function RecoveryRequests() {
  const qc = useQueryClient();
  const listQuery = useAdminListRecoveryRequests({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { refetchInterval: 30_000 } as any,
  });
  const cancelMutation = useAdminCancelRecoveryRequest();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCancel = async (id: number, email: string) => {
    if (
      !window.confirm(
        `Cancel the recovery request for ${email}?\n\n` +
          `They will be notified by email and will need to submit a new request if they really are locked out.`,
      )
    )
      return;
    setError(null);
    setBusyId(id);
    try {
      await cancelMutation.mutateAsync({ id });
      await qc.invalidateQueries({
        queryKey: getAdminListRecoveryRequestsQueryKey(),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Could not cancel: ${err.status}`);
      } else {
        setError("Could not cancel.");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Staff Recovery Requests
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
          Locked-out staff can request a recovery link, which is usable
          immediately. Cancel any request below if it looks suspicious — the
          requester will be notified by email.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2 rounded"
        >
          {error}
        </div>
      )}

      {listQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Spinner className="size-4" /> Loading…
        </div>
      ) : listQuery.data && listQuery.data.length > 0 ? (
        <div className="overflow-x-auto border border-slate-200 rounded">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Requested</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2 font-medium">From</th>
                <th className="px-3 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data.map((row) => {
                return (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {row.userEmail}
                    </td>
                    <td className="px-3 py-2 capitalize">{row.userRole}</td>
                    <td className="px-3 py-2">{fmt(row.requestedAt)}</td>
                    <td className="px-3 py-2">{fmt(row.expiresAt)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {row.requestIp ?? "—"}
                      {row.requestUserAgent && (
                        <div
                          className="truncate max-w-[20rem]"
                          title={row.requestUserAgent}
                        >
                          {row.requestUserAgent}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === row.id}
                        onClick={() => onCancel(row.id, row.userEmail)}
                      >
                        {busyId === row.id ? "Cancelling…" : "Cancel"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-slate-600 border border-dashed border-slate-300 rounded p-6 text-center">
          No active recovery requests.
        </div>
      )}
    </div>
  );
}
