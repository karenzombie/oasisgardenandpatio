import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import {
  useStaffListNotifications,
  useStaffGetUnreadNotificationCount,
  useStaffMarkNotificationRead,
  useStaffMarkAllNotificationsRead,
  getStaffListNotificationsQueryKey,
  getStaffGetUnreadNotificationCountQueryKey,
  type StaffNotification,
} from "@workspace/api-client-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";

const POLL_MS = 60_000;

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const countQ = useStaffGetUnreadNotificationCount({
    query: {
      queryKey: getStaffGetUnreadNotificationCountQueryKey(),
      refetchInterval: POLL_MS,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  });

  const listParams = { limit: 25 } as const;
  const listQ = useStaffListNotifications(listParams, {
    query: {
      queryKey: getStaffListNotificationsQueryKey(listParams),
      enabled: open,
      refetchOnWindowFocus: false,
    },
  });

  const markOne = useStaffMarkNotificationRead();
  const markAll = useStaffMarkAllNotificationsRead();

  const unread = countQ.data?.unread ?? 0;
  const items = listQ.data ?? [];

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({
        queryKey: getStaffListNotificationsQueryKey(),
      }),
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
    if (n.linkUrl) {
      setOpen(false);
      navigate(n.linkUrl);
    }
  }

  async function handleMarkAll() {
    try {
      await markAll.mutateAsync();
      await refreshAll();
    } catch {
      /* ignore */
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="p-2 hover:bg-white/10 rounded relative"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-semibold text-white flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">Notifications</div>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50"
            onClick={handleMarkAll}
            disabled={unread === 0 || markAll.isPending}
          >
            Mark all read
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {listQ.isLoading ? (
            <div className="p-6 flex justify-center">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 ${
                      n.isRead ? "" : "bg-sky-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.isRead && (
                        <span
                          className="mt-1.5 size-2 rounded-full bg-sky-500 flex-shrink-0"
                          aria-hidden
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 break-words">
                          {n.message}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {relTime(n.createdAt)}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
