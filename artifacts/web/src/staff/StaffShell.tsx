import { useState, type ReactNode } from "react";
import type { StaffUser } from "@workspace/api-client-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface StaffShellProps {
  user: StaffUser;
  children: ReactNode;
}

export function StaffShell({ user, children }: StaffShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = user.role;

  return (
    <div className="min-h-[100dvh] flex bg-[#F5F7FA] text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex h-[100dvh] sticky top-0">
        <Sidebar role={role} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="relative h-full">
            <Sidebar role={role} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar user={user} onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="p-6">{children}</div>;
}
