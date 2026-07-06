import type { StaffUser } from "@workspace/api-client-react";
import { PageBody, PageHeader } from "../../StaffShell";
import { Link } from "wouter";
import {
  ShoppingCart,
  Users,
  Truck,
  Store,
  Armchair,
  Tag,
  Package,
  BarChart3,
  BookOpen,
  Database,
  type LucideIcon,
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
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
        >
          <DashboardCard label="Orders" icon={ShoppingCart} href="/admin/orders">
            <RowList
              rows={[
                { label: "Pending", value: 4 },
                { label: "Confirmed", value: 9 },
                { label: "In production", value: 12 },
                { label: "Ready for store delivery", value: 3 },
                { label: "Carrier delivery update", value: 2 },
                { label: "Out for local delivery", value: 1 },
                { label: "Delivered", value: 27 },
                { label: "Completed", value: 58 },
                { label: "Canceled", value: 2 },
                { label: "Refunded", value: 1 },
              ]}
            />
          </DashboardCard>

          <DashboardCard label="Customers" icon={Users} href="/admin/customers">
            <RowList
              rows={[
                { label: "Total customers", value: 214 },
                { label: "New customers (48 hrs)", value: 3 },
                { label: "New wishlist items to reach out", value: 6 },
              ]}
            />
          </DashboardCard>

          <DashboardCard label="Deliveries" icon={Truck} href="/admin/deliveries">
            <RowList
              rows={[
                { label: "Ready, not scheduled", value: 5 },
                { label: "Local delivery today", value: 2 },
                { label: "Local deliveries this week", value: 7 },
                { label: "Carrier delivery updated", value: 1 },
              ]}
            />
          </DashboardCard>

          <DashboardCard label="Vendor orders" icon={Store} href="/admin/vendor-orders">
            <RowList
              rows={[
                { label: "Not sent to vendor", value: 3 },
                { label: "Sent to vendor", value: 8 },
                { label: "Acknowledged by vendor", value: 14 },
              ]}
            />
          </DashboardCard>

          <DashboardCard label="Products" icon={Armchair} href="/admin/products">
            <BigNumber value={1042} label="Total products in system" />
          </DashboardCard>

          <DashboardCard label="Vendors" icon={Tag} href="/admin/manufacturers">
            <BigNumber value={18} label="Manufacturers" />
          </DashboardCard>

          <DashboardCard label="Inventory" icon={Package} href="/admin/inventory">
            <RowList
              rows={[
                { label: "On store display", value: 86 },
                { label: "In warehouse", value: 512 },
              ]}
            />
          </DashboardCard>

          <DashboardCard label="Reports" icon={BarChart3} href="/admin/reports">
            <p className="text-sm text-slate-500">
              View sales, order history, and store performance.
            </p>
          </DashboardCard>

          <DashboardCard label="User guide" icon={BookOpen}>
            <p className="text-sm text-slate-500 italic">
              Coming soon — step-by-step guidance for using the staff portal.
            </p>
          </DashboardCard>

          <DashboardCard label="Backups" icon={Database}>
            <RowList rows={[{ label: "Last backup", value: "Not yet configured", muted: true }]} />
          </DashboardCard>
        </div>
      </PageBody>
    </>
  );
}

function DashboardCard({
  label,
  icon: Icon,
  href,
  children,
}: {
  label: string;
  icon: LucideIcon;
  href?: string;
  children: React.ReactNode;
}) {
  const inner = (
    <div className="h-full bg-white border border-slate-200 rounded-md p-4 transition-colors hover:border-slate-400">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-4 text-slate-500" strokeWidth={1.75} />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
      </div>
      {children}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

function RowList({
  rows,
}: {
  rows: Array<{ label: string; value: string | number; muted?: boolean }>;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-600">{row.label}</span>
          <span
            className={
              row.muted
                ? "text-slate-400 italic text-xs shrink-0"
                : "text-slate-900 font-semibold shrink-0"
            }
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function BigNumber({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-3xl font-semibold text-slate-900 leading-tight">
        {value}
      </div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}
