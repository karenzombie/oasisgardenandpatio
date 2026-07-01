import type { StaffUser } from "@workspace/api-client-react";
import { useAdminGetAgentDashboardStats } from "@workspace/api-client-react";
import { PageBody, PageHeader } from "../../StaffShell";
import { Link } from "wouter";
import { ShoppingCart, ClipboardList, Users, type LucideIcon } from "lucide-react";

interface AgentDashboardProps {
  user: StaffUser;
}

export default function AgentDashboard({ user }: AgentDashboardProps) {
  const greeting = user.firstName
    ? `Hi ${user.firstName}, ready to take an order?`
    : "Ready to take an order?";

  const stats = useAdminGetAgentDashboardStats();
  const d = stats.data;

  return (
    <>
      <PageHeader title={greeting} />
      <PageBody>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="My Open Orders"
            value={d ? String(d.myOpenOrders) : "—"}
            icon={ShoppingCart}
            loading={stats.isLoading}
            href="/agent/orders"
          />
          <StatCard
            label="My Orders This Week"
            value={d ? String(d.myOrdersThisWeek) : "—"}
            icon={ClipboardList}
            loading={stats.isLoading}
            href="/agent/orders"
          />
          <StatCard
            label="Customers Helped"
            value={d ? String(d.customersHelped) : "—"}
            icon={Users}
            loading={stats.isLoading}
            href="/agent/customers"
          />
        </div>

        <div className="mt-6 bg-white border border-slate-200 rounded-md p-6 text-sm text-slate-700">
          Use the <strong>Create New Order</strong> tab to start an in-store order.
          Open orders, customers, and reports are visible in the left sidebar.
        </div>
      </PageBody>
    </>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  loading?: boolean;
  href?: string;
}) {
  const inner = (
    <div className="bg-white border border-slate-200 rounded-md p-4 flex items-center gap-3 transition-colors hover:border-slate-300">
      <div className="size-10 rounded bg-[#1A3C5E]/10 text-[#1A3C5E] flex items-center justify-center shrink-0">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className={`text-2xl font-semibold leading-tight ${loading ? "text-slate-300 animate-pulse" : "text-slate-900"}`}>
          {value}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}
