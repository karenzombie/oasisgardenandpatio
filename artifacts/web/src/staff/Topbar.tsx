import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStaffLogout,
  getStaffGetStateQueryKey,
  getGetCurrentUserQueryKey,
  type StaffUser,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Menu, LogOut } from "lucide-react";
import { NotificationBell } from "./NotificationBell";

interface TopbarProps {
  user: StaffUser;
  onMenu?: () => void;
}

export function Topbar({ user, onMenu }: TopbarProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const logoutMutation = useStaffLogout();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      // Clear ALL cached queries — prevents the next user (e.g. on a shared
      // workstation) from briefly seeing the prior user's notifications,
      // unread count, or any other per-user data from React Query cache.
      queryClient.clear();
      // Defensive: explicitly drop these too in case clear() is partial.
      queryClient.removeQueries({ queryKey: getStaffGetStateQueryKey() });
      queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
      navigate("/staff");
    }
  };

  const initials = (
    (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")
  ).toUpperCase() || user.email[0]?.toUpperCase() || "?";

  return (
    <header className="h-16 bg-primary text-primary-foreground border-b border-white/10 flex items-center px-4 gap-3">
      {onMenu && (
        <button
          type="button"
          className="lg:hidden p-2 -ml-2 hover:bg-white/10 rounded"
          onClick={onMenu}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
      )}

      <div className="flex-1" />

      <NotificationBell />

      <div className="flex items-center gap-3 pl-3 ml-2 border-l border-white/10">
        <div className="size-8 rounded-full bg-white/15 flex items-center justify-center text-xs font-semibold">
          {initials}
        </div>
        <div className="hidden md:block leading-tight">
          <div className="text-sm font-medium">
            {user.firstName ?? user.email}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-white/60">
            {user.role}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="size-4 mr-1" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
