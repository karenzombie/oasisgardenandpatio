import type { StaffUser } from "@workspace/api-client-react";
import { PageBody, PageHeader } from "../../StaffShell";
import {
  ShoppingCart,
  Package,
  Users,
  AlertCircle,
} from "lucide-react";

interface AdminDashboardProps {
  user: StaffUser;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const greeting = user.firstName ? `Welcome back, ${user.firstName}` : "Welcome back";

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle="Here's a quick snapshot of your store."
      />
      <PageBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Open Orders" value="—" icon={ShoppingCart} />
          <StatCard label="Active Products" value="—" icon={Package} />
          <StatCard label="Total Customers" value="—" icon={Users} />
          <StatCard
            label="Items Needing Attention"
            value="—"
            icon={AlertCircle}
          />
        </div>

        <div className="mt-6 bg-white border border-slate-200 rounded-md p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">
            Getting started
          </h2>
          <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
            <li>
              Add manufacturers in <strong>Catalog → Manufacturers</strong>.
            </li>
            <li>
              Build your category tree in <strong>Catalog → Categories</strong>.
            </li>
            <li>
              Add products one-by-one in <strong>Catalog → Products</strong>, or
              use the CSV importer to bulk-load from a vendor sheet.
            </li>
            <li>
              Configure tax, shipping, and store settings in{" "}
              <strong>System → Settings</strong>.
            </li>
          </ol>
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
