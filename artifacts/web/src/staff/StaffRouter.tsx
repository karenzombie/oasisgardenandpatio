import { Switch, Route } from "wouter";
import { RequireStaff } from "./RequireStaff";
import { StaffShell } from "./StaffShell";
import StaffLogin from "./pages/StaffLogin";
import StaffRecoverRequest from "./pages/StaffRecoverRequest";
import StaffRecoverComplete from "./pages/StaffRecoverComplete";
import Setup2FA from "./pages/Setup2FA";
import Verify2FA from "./pages/Verify2FA";
import ChangePassword from "./pages/ChangePassword";
import AdminDashboard from "./pages/admin/Dashboard";
import AgentDashboard from "./pages/agent/Dashboard";
import AgentOrders from "./pages/agent/Orders";
import AgentOrderDetail from "./pages/agent/OrderDetail";
import AgentNewOrder from "./pages/agent/NewOrder";
import AgentCustomers from "./pages/agent/Customers";
import AgentProducts from "./pages/agent/Products";
import AgentInventory from "./pages/agent/Inventory";
import AgentReports from "./pages/agent/Reports";
import Manufacturers from "./pages/admin/Manufacturers";
import Categories from "./pages/admin/Categories";
import Products from "./pages/admin/Products";
import ProductEdit from "./pages/admin/ProductEdit";
import ProductsImport from "./pages/admin/ProductsImport";
import Sets from "./pages/admin/Sets";
import SetEdit from "./pages/admin/SetEdit";
import Inventory from "./pages/admin/Inventory";
import Carriers from "./pages/admin/Carriers";
import Banners from "./pages/admin/Banners";
import Legal from "./pages/admin/Legal";
import Settings from "./pages/admin/Settings";
import Discounts from "./pages/admin/Discounts";
import Users from "./pages/admin/Users";
import AuditLog from "./pages/admin/AuditLog";
import Orders from "./pages/admin/Orders";
import OrderDetail from "./pages/admin/OrderDetail";
import VendorOrders from "./pages/admin/VendorOrders";
import VendorOrderDetail from "./pages/admin/VendorOrderDetail";
import CushionOrders from "./pages/admin/CushionOrders";
import CushionOrderDetail from "./pages/admin/CushionOrderDetail";
import RecoveryRequests from "./pages/admin/RecoveryRequests";
import Reports from "./pages/admin/Reports";
import { PagePlaceholder } from "./pages/PagePlaceholder";

const ADMIN_PLACEHOLDERS: Array<{ path: string; title: string; comingIn: string }> = [
  { path: "/notifications", title: "Notifications", comingIn: "Phase 6.18" },
];

const AGENT_PLACEHOLDERS: Array<{ path: string; title: string; comingIn: string }> = [];

export default function StaffRouter() {
  return (
    <Switch>
      {/* Public staff auth routes (no shell) */}
      <Route path="/staff" component={StaffLogin} />
      <Route path="/staff/recover" component={StaffRecoverRequest} />
      <Route path="/staff/recover/:token" component={StaffRecoverComplete} />
      <Route path="/staff/setup-2fa" component={Setup2FA} />
      <Route path="/staff/verify-2fa" component={Verify2FA} />
      <Route path="/staff/change-password" component={ChangePassword} />

      {/* Admin section (matches /admin and /admin/*) */}
      <Route path="/admin" nest>
        <RequireStaff requireRole="admin">
          {(user) => (
            <StaffShell user={user}>
              <Switch>
                {/* Index route — wouter v3 nest can strip `/admin` to `""` or
                    `/`, so accept both. */}
                <Route path={/^\/?$/}>
                  {() => <AdminDashboard user={user} />}
                </Route>
                <Route path="/manufacturers" component={Manufacturers} />
                <Route path="/categories" component={Categories} />
                <Route path="/products" component={Products} />
                <Route path="/products/import" component={ProductsImport} />
                <Route path="/products/new" component={ProductEdit} />
                <Route path="/products/:id" component={ProductEdit} />
                <Route path="/sets" component={Sets} />
                <Route path="/sets/:id" component={SetEdit} />
                <Route path="/inventory" component={Inventory} />
                <Route path="/carriers" component={Carriers} />
                <Route path="/banners" component={Banners} />
                <Route path="/legal" component={Legal} />
                <Route path="/settings" component={Settings} />
                <Route path="/discounts" component={Discounts} />
                <Route path="/users" component={Users} />
                <Route path="/customers" component={Users} />
                <Route path="/audit-log" component={AuditLog} />
                <Route path="/recovery-requests" component={RecoveryRequests} />
                <Route path="/orders" component={Orders} />
                <Route path="/orders/:id" component={OrderDetail} />
                <Route path="/vendor-orders" component={VendorOrders} />
                <Route path="/vendor-orders/:id" component={VendorOrderDetail} />
                <Route path="/cushion-orders" component={CushionOrders} />
                <Route path="/cushion-orders/:id" component={CushionOrderDetail} />
                <Route path="/reports" component={Reports} />
                {ADMIN_PLACEHOLDERS.map(({ path, title, comingIn }) => (
                  <Route key={path} path={path}>
                    {() => <PagePlaceholder title={title} comingIn={comingIn} />}
                  </Route>
                ))}
                <Route>
                  {() => (
                    <PagePlaceholder
                      title="Not Found"
                      subtitle="That admin page does not exist."
                    />
                  )}
                </Route>
              </Switch>
            </StaffShell>
          )}
        </RequireStaff>
      </Route>

      {/* Agent section (matches /agent and /agent/*) */}
      <Route path="/agent" nest>
        <RequireStaff>
          {(user) => (
            <StaffShell user={user}>
              <Switch>
                <Route path={/^\/?$/}>
                  {() => <AgentDashboard user={user} />}
                </Route>
                <Route path="/new-order" component={AgentNewOrder} />
                <Route path="/orders" component={AgentOrders} />
                <Route path="/orders/:id" component={AgentOrderDetail} />
                <Route path="/customers" component={AgentCustomers} />
                <Route path="/products" component={AgentProducts} />
                <Route path="/inventory" component={AgentInventory} />
                <Route path="/reports" component={AgentReports} />
                {AGENT_PLACEHOLDERS.map(({ path, title, comingIn }) => (
                  <Route key={path} path={path}>
                    {() => <PagePlaceholder title={title} comingIn={comingIn} />}
                  </Route>
                ))}
                <Route>
                  {() => (
                    <PagePlaceholder
                      title="Not Found"
                      subtitle="That page does not exist."
                    />
                  )}
                </Route>
              </Switch>
            </StaffShell>
          )}
        </RequireStaff>
      </Route>
    </Switch>
  );
}
