import type { StaffUser } from "@workspace/api-client-react";
import { PageBody, PageHeader } from "../../StaffShell";
import { ShoppingCart, ClipboardList, Users } from "lucide-react";

interface AgentDashboardProps {
  user: StaffUser;
}

export default function AgentDashboard({ user }: AgentDashboardProps) {
  const greeting = user.firstName
    ? `Hi ${user.firstName}, ready to take an order?`
    : "Ready to take an order?";

  return (
    <>
      <PageHeader title={greeting} />
      <PageBody>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="My Open Orders" value="—" icon={ShoppingCart} />
          <StatCard
            label="My Orders This Week"
            value="—"
            icon={ClipboardList}
          />
          <StatCard label="Customers Helped" value="—" icon={Users} />
        </div>

        <div className="mt-6 bg-white border border-slate-200 rounded-md p-6 text-sm text-slate-700">
          Use the <strong>New Order</strong> tab to start an in-store order.
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
}: {
  label: string;
  value: string;
  icon: typeof ShoppingCart;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-4 flex items-center gap-3">
      <div className="size-10 rounded bg-[#1A3C5E]/10 text-[#1A3C5E] flex items-center justify-center">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className="text-2xl font-semibold text-slate-900 leading-tight">
          {value}
        </div>
      </div>
    </div>
  );
}
