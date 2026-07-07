import { useState } from "react";
import type { StaffUser } from "@workspace/api-client-react";
import { useAdminGetDashboardStats } from "@workspace/api-client-react";
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
  HardDrive,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTimestamp } from "./Backups";
import type { BackupRun } from "./Backups";

interface AdminDashboardProps {
  user: StaffUser;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const greeting = user.firstName ? `Welcome back, ${user.firstName}` : "Welcome back";
  const stats = useAdminGetDashboardStats();
  const ordersByStatus = stats.data?.ordersByStatus;
  const orderCount = (value: number | undefined) =>
    stats.isLoading ? "—" : (value ?? 0);

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
                { label: "Pending", value: orderCount(ordersByStatus?.pending) },
                { label: "Confirmed", value: orderCount(ordersByStatus?.confirmed) },
                { label: "In production", value: orderCount(ordersByStatus?.in_production) },
                {
                  label: "Ready for store delivery",
                  value: orderCount(ordersByStatus?.ready_for_store_delivery),
                },
                {
                  label: "Carrier delivery update",
                  value: orderCount(ordersByStatus?.carrier_delivery_update),
                },
                {
                  label: "Out for local delivery",
                  value: orderCount(ordersByStatus?.out_for_local_delivery),
                },
                { label: "Delivered", value: orderCount(ordersByStatus?.delivered) },
                { label: "Completed", value: orderCount(ordersByStatus?.completed) },
                { label: "Canceled", value: orderCount(ordersByStatus?.canceled) },
                { label: "Refunded", value: orderCount(ordersByStatus?.refunded) },
              ]}
            />
          </DashboardCard>

          <DashboardCard label="Customers" icon={Users} href="/admin/customers">
            <RowList
              rows={[
                { label: "Total online customers", value: orderCount(stats.data?.totalCustomers) },
                {
                  label: "New online customers (48 hrs)",
                  value: orderCount(stats.data?.newCustomersLast48h),
                },
                {
                  label: "New wishlist items to reach out",
                  value: orderCount(stats.data?.wishlistItemsNeedingReachOut),
                },
              ]}
            />
          </DashboardCard>

          <DashboardCard label="Deliveries" icon={Truck} href="/admin/deliveries">
            <RowList
              rows={[
                {
                  label: "Ready, not scheduled",
                  value: orderCount(stats.data?.readyNotScheduled),
                },
                {
                  label: "Local delivery today",
                  value: orderCount(stats.data?.localDeliveryToday),
                },
                {
                  label: "Local deliveries this week",
                  value: orderCount(stats.data?.localDeliveriesThisWeek),
                },
                {
                  label: "Carrier delivery updated",
                  value: orderCount(stats.data?.carrierDeliveryUpdated),
                },
              ]}
            />
          </DashboardCard>

          <DashboardCard label="Vendor orders" icon={Store} href="/admin/vendor-orders">
            <RowList
              rows={[
                {
                  label: "Not sent to vendor",
                  value: orderCount(stats.data?.pendingVendorOrders),
                },
                {
                  label: "Sent to vendor",
                  value: orderCount(stats.data?.sentToVendor),
                },
                {
                  label: "Acknowledged by vendor",
                  value: orderCount(stats.data?.acknowledgedByVendor),
                },
              ]}
            />
          </DashboardCard>

          <DashboardCard label="Products" icon={Armchair} href="/admin/products">
            <BigNumber
              value={orderCount(stats.data?.totalProducts)}
              label="Total products in system"
            />
          </DashboardCard>

          <DashboardCard label="Vendors" icon={Tag} href="/admin/manufacturers">
            <BigNumber
              value={orderCount(stats.data?.totalManufacturers)}
              label="Manufacturers"
            />
          </DashboardCard>

          <DashboardCard label="Inventory" icon={Package} href="/admin/inventory">
            <BigNumber
              value={orderCount(stats.data?.totalOnHand)}
              label="Total on hand"
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

          <BackupWidgetCard lastProducts={null} lastCustomers={null} />
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

function BigNumber({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div>
      <div className="text-3xl font-semibold text-slate-900 leading-tight">
        {value}
      </div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function BackupWidgetCard({
  lastProducts,
  lastCustomers,
}: {
  lastProducts: BackupRun | null;
  lastCustomers: BackupRun | null;
}) {
  const toast = useToast();
  const [confirmType, setConfirmType] = useState<"products" | "customers" | null>(null);
  const [loadingType, setLoadingType] = useState<"products" | "customers" | null>(null);

  async function runBackup(type: "products" | "customers") {
    setConfirmType(null);
    setLoadingType(type);
    try {
      // TODO (step 6+7): wire to POST /api/admin/backup/products or /api/admin/backup/customers
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      toast.toast({
        title:
          type === "products"
            ? "Products backup complete"
            : "Customer data backup complete",
      });
    } catch (err) {
      toast.toast({
        title: "Backup failed",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <>
      <div className="h-full bg-white border border-slate-200 rounded-md p-4 transition-colors hover:border-slate-400">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="size-4 text-slate-500" strokeWidth={1.75} />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Backups
          </span>
        </div>
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">Last products backup</span>
            <span className="text-slate-400 italic text-xs shrink-0">
              {lastProducts ? formatTimestamp(lastProducts.ranAt) : "Never"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">Last customer backup</span>
            <span className="text-slate-400 italic text-xs shrink-0">
              {lastCustomers ? formatTimestamp(lastCustomers.ranAt) : "Never"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            disabled={loadingType === "products"}
            onClick={() => setConfirmType("products")}
            className="bg-green-700 hover:bg-green-800 text-white w-full justify-center"
          >
            {loadingType === "products" ? (
              <><Spinner className="mr-1.5 size-3" />Backing up…</>
            ) : (
              "Back Up Products"
            )}
          </Button>
          <Button
            size="sm"
            disabled={loadingType === "customers"}
            onClick={() => setConfirmType("customers")}
            className="bg-green-700 hover:bg-green-800 text-white w-full justify-center"
          >
            {loadingType === "customers" ? (
              <><Spinner className="mr-1.5 size-3" />Backing up…</>
            ) : (
              "Back Up Customer Data"
            )}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={confirmType === "products"}
        onOpenChange={(o) => !o && setConfirmType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Back up products?</AlertDialogTitle>
            <AlertDialogDescription>
              This will export the full database and all product images to
              GitHub. Depending on image volume this may take several minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runBackup("products")}
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              Run Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmType === "customers"}
        onOpenChange={(o) => !o && setConfirmType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Back up customer data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will export all customer, order, and transaction data to
              GitHub.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runBackup("customers")}
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              Run Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
