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
import Fabrics from "./pages/admin/Fabrics";
import Finishes from "./pages/admin/Finishes";
import FinishCollections from "./pages/admin/FinishCollections";
import Inventory from "./pages/admin/Inventory";
import Carriers from "./pages/admin/Carriers";
import Banners from "./pages/admin/Banners";
import Legal from "./pages/admin/Legal";
import Settings from "./pages/admin/Settings";
import Discounts from "./pages/admin/Discounts";
import CustomerUsers, { StaffAccountsPage } from "./pages/admin/Users";
import AuditLog from "./pages/admin/AuditLog";
import Orders from "./pages/admin/Orders";
import OrderDetail from "./pages/admin/OrderDetail";
import VendorOrders from "./pages/admin/VendorOrders";
import VendorOrderNew from "./pages/admin/VendorOrderNew";
import VendorOrderDetail from "./pages/admin/VendorOrderDetail";
import Shipping from "./pages/admin/Shipping";
import CushionOrders from "./pages/admin/CushionOrders";
import CushionOrderDetail from "./pages/admin/CushionOrderDetail";
import CushionOrderNew from "./pages/admin/CushionOrderNew";
import RecoveryRequests from "./pages/admin/RecoveryRequests";
import Reports from "./pages/admin/Reports";
import Backups from "./pages/admin/Backups";
import Deliveries from "./pages/admin/Deliveries";
import WishlistDetail from "./pages/admin/WishlistDetail";
import WishlistPrint from "./pages/admin/WishlistPrint";
import { PagePlaceholder } from "./pages/PagePlaceholder";

const ADMIN_PLACEHOLDERS: Array<{ path: string; title: string; comingIn: string }> = [];

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

      {/* Admin section — uses a regex path on the outer Route (NOT `nest`) so
          the inner <Switch> sees absolute locations and we avoid wouter v3's
          flaky base-stripping behaviour. */}
      <Route path={/^\/admin(?:\/.*)?$/}>
        <RequireStaff requireRole="admin">
          {(user) => (
            <StaffShell user={user}>
              <Switch>
                <Route path="/admin">
                  {() => <AdminDashboard user={user} />}
                </Route>
                <Route path="/admin/manufacturers" component={Manufacturers} />
                <Route path="/admin/categories" component={Categories} />
                <Route path="/admin/products" component={Products} />
                <Route path="/admin/products/import" component={ProductsImport} />
                <Route path="/admin/products/new" component={ProductEdit} />
                <Route path="/admin/products/:id" component={ProductEdit} />
                <Route path="/admin/sets" component={Sets} />
                <Route path="/admin/sets/:id" component={SetEdit} />
                <Route path="/admin/fabrics" component={Fabrics} />
                <Route path="/admin/finishes" component={Finishes} />
                <Route path="/admin/finish-collections" component={FinishCollections} />
                <Route path="/admin/inventory" component={Inventory} />
                <Route path="/admin/carriers" component={Carriers} />
                <Route path="/admin/banners" component={Banners} />
                <Route path="/admin/legal" component={Legal} />
                <Route path="/admin/settings" component={Settings} />
                <Route path="/admin/discounts" component={Discounts} />
                <Route path="/admin/users" component={StaffAccountsPage} />
                <Route path="/admin/customers" component={CustomerUsers} />
                <Route path="/admin/wishlists/:id" component={WishlistDetail} />
                <Route path="/admin/wishlists/:id/print" component={WishlistPrint} />
                <Route path="/admin/audit-log" component={AuditLog} />
                <Route path="/admin/recovery-requests" component={RecoveryRequests} />
                <Route path="/admin/backups" component={Backups} />
                <Route path="/admin/orders" component={Orders} />
                <Route path="/admin/new-order" component={AgentNewOrder} />
                <Route path="/admin/orders/:id" component={OrderDetail} />
                <Route path="/admin/deliveries" component={Deliveries} />
                <Route path="/admin/vendor-orders" component={VendorOrders} />
                <Route path="/admin/vendor-orders/new" component={VendorOrderNew} />
                <Route path="/admin/vendor-orders/:id" component={VendorOrderDetail} />
                <Route path="/admin/shipping" component={Shipping} />
                <Route path="/admin/cushion-orders" component={CushionOrders} />
                <Route path="/admin/cushion-orders/new" component={CushionOrderNew} />
                <Route path="/admin/cushion-orders/:id" component={CushionOrderDetail} />
                <Route path="/admin/reports" component={Reports} />
                {ADMIN_PLACEHOLDERS.map(({ path, title, comingIn }) => (
                  <Route key={path} path={`/admin${path}`}>
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

      {/* Agent section — same approach as admin. */}
      <Route path={/^\/agent(?:\/.*)?$/}>
        <RequireStaff>
          {(user) => (
            <StaffShell user={user}>
              <Switch>
                <Route path="/agent">
                  {() => <AgentDashboard user={user} />}
                </Route>
                <Route path="/agent/new-order" component={AgentNewOrder} />
                <Route path="/agent/orders" component={AgentOrders} />
                <Route path="/agent/orders/:id" component={AgentOrderDetail} />
                <Route path="/agent/cushion-orders" component={CushionOrders} />
                <Route path="/agent/cushion-orders/new" component={CushionOrderNew} />
                <Route path="/agent/cushion-orders/:id" component={CushionOrderDetail} />
                <Route path="/agent/customers" component={AgentCustomers} />
                <Route path="/agent/products" component={AgentProducts} />
                <Route path="/agent/inventory" component={AgentInventory} />
                <Route path="/agent/reports" component={AgentReports} />
                {AGENT_PLACEHOLDERS.map(({ path, title, comingIn }) => (
                  <Route key={path} path={`/agent${path}`}>
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
