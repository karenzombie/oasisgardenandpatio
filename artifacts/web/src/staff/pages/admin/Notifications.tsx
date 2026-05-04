import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, CheckCheck } from "lucide-react";
import {
  useStaffListNotifications,
  useStaffMarkNotificationRead,
  useStaffMarkAllNotificationsRead,
  useStaffGetUnreadNotificationCount,
  getStaffListNotificationsQueryKey,
  getStaffGetUnreadNotificationCountQueryKey,
  type StaffNotification,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PageBody, PageHeader } from "../../StaffShell";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

type Filter = "all" | "unread";

export default function Notifications() {
  const [filter, setFilter] = useState<Filter>("all");
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const params = {
    limit: 100,
    ...(filter === "unread" ? { unreadOnly: true } : {}),
  } as const;

  const listQ = useStaffListNotifications(params, {
    query: {
      queryKey: getStaffListNotificationsQueryKey(params),
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  });

  const countQ = useStaffGetUnreadNotificationCount({
    query: {
      queryKey: getStaffGetUnreadNotificationCountQueryKey(),
      staleTime: 15_000,
    },
  });

  const markOne = useStaffMarkNotificationRead();
  const markAll = useStaffMarkAllNotificationsRead();

  const items: StaffNotification[] = listQ.data ?? [];
  const unread = countQ.data?.unread ?? 0;

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getStaffListNotificationsQueryKey() }),
      qc.invalidateQueries({
        queryKey: getStaffGetUnreadNotificationCountQueryKey(),
      }),
    ]);
  }

  async function handleClick(n: StaffNotification) {
    if (!n.isRead) {
      try {
        await markOne.mutateAsync({ id: n.id });
        await refreshAll();
      } catch {
        /* ignore */
      }
    }
    if (n.linkUrl) navigate(n.linkUrl);
  }

  async function handleMarkAll() {
    try {
      await markAll.mutateAsync();
      await refreshAll();
    } catch {
      /* ignore */
    }
  }

  const tabs: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Unread", value: "unread" },
  ];

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Activity alerts for orders, vendor orders, and system events."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAll}
            disabled={unread === 0 || markAll.isPending}
            className="gap-1.5"
          >
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        }
      />

      <PageBody>
        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                filter === tab.value
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
              {tab.value === "unread" && unread > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-px rounded-full bg-sky-100 text-sky-700 text-[10px] font-semibold leading-none">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg border overflow-hidden">
          {listQ.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : listQ.isError ? (
            <div className="p-6 text-sm text-rose-600">
              Failed to load notifications.
            </div>
          ) : items.length === 0 ? (
            <div className="p-16 text-center">
              <Bell className="size-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium text-slate-500">
                {filter === "unread"
                  ? "You're all caught up — no unread notifications."
                  : "No notifications yet."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-5 py-3.5 flex items-start gap-3 transition-colors hover:bg-slate-50 ${
                      n.isRead ? "" : "bg-sky-50/50"
                    } ${n.linkUrl ? "cursor-pointer" : "cursor-default"}`}
                  >
                    {/* Unread dot */}
                    <span className="mt-1.5 size-2 flex-shrink-0">
                      {!n.isRead && (
                        <span className="block size-2 rounded-full bg-sky-500" />
                      )}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm break-words leading-snug ${
                          n.isRead ? "text-slate-600" : "text-slate-900 font-medium"
                        }`}
                      >
                        {n.message}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {relTime(n.createdAt)}
                      </p>
                    </div>

                    {n.linkUrl && (
                      <span className="text-xs text-sky-600 flex-shrink-0 self-center">
                        View →
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageBody>
    </>
  );
}
