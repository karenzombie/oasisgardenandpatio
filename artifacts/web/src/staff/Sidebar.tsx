import { Link, useLocation } from "wouter";
import { navForRole } from "./nav";
import logoUrl from "@/assets/logo.png";

interface SidebarProps {
  role: "agent" | "admin";
  onNavigate?: () => void;
}

export function Sidebar({ role, onNavigate }: SidebarProps) {
  const [loc] = useLocation();
  const groups = navForRole(role);

  return (
    <aside className="h-full w-64 bg-primary text-primary-foreground flex flex-col">
      <div className="h-16 px-5 flex items-center gap-3 border-b border-white/10">
        <div className="bg-white rounded p-1 flex items-center justify-center">
          <img
            src={logoUrl}
            alt="Oasis Garden & Patio"
            className="h-8 w-auto object-contain"
          />
        </div>
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-wider text-white/60">
            {role === "admin" ? "Admin Portal" : "Sales Agent"}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {groups.map((group) => (
          <div key={group.heading}>
            <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
              {group.heading}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  loc === item.path ||
                  (item.path !== "/admin" &&
                    item.path !== "/agent" &&
                    loc.startsWith(`${item.path}/`));
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <Link
                      href={item.path}
                      onClick={onNavigate}
                      className={[
                        "flex items-center gap-2 px-2.5 py-2 rounded text-sm transition-colors",
                        isActive
                          ? "bg-white/15 text-white"
                          : "text-white/80 hover:bg-white/10 hover:text-white",
                      ].join(" ")}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-white/10 text-[11px] text-white/50">
        v0.1 · Oasis Garden &amp; Patio
      </div>
    </aside>
  );
}
