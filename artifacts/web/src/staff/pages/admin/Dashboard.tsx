import type { StaffUser } from "@workspace/api-client-react";
import { useAdminGetDashboardStats } from "@workspace/api-client-react";
import { PageBody, PageHeader } from "../../StaffShell";
import { Link } from "wouter";
import {
  ShoppingCart,
  Package,
  Users,
  AlertCircle,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

interface AdminDashboardProps {
  user: StaffUser;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const greeting = user.firstName ? `Welcome back, ${user.firstName}` : "Welcome back";
  const stats = useAdminGetDashboardStats();
  const d = stats.data;

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle="Here's a quick snapshot of your store."
      />
      <PageBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Open Orders"
            value={d ? String(d.openOrders) : "—"}
            icon={ShoppingCart}
            loading={stats.isLoading}
            href="/admin/orders"
          />
          <StatCard
            label="Active Products"
            value={d ? String(d.activeProducts) : "—"}
            icon={Package}
            loading={stats.isLoading}
            href="/admin/products"
          />
          <StatCard
            label="Total Customers"
            value={d ? String(d.totalCustomers) : "—"}
            icon={Users}
            loading={stats.isLoading}
            href="/admin/customers"
          />
          <StatCard
            label="Vendor Orders Pending"
            value={d ? String(d.pendingVendorOrders) : "—"}
            icon={AlertCircle}
            loading={stats.isLoading}
            href="/admin/vendor-orders"
          />
        </div>

        <div className="mt-6 bg-white border border-slate-200 rounded-md p-6 flex items-start gap-4">
          <div className="size-10 rounded bg-[#1A3C5E]/10 text-[#1A3C5E] flex items-center justify-center shrink-0">
            <BookOpen className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              User Guide
            </h2>
            <p className="text-sm text-slate-500">
              Coming soon — step-by-step guidance for using the staff portal
              will appear here.
            </p>
          </div>
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
