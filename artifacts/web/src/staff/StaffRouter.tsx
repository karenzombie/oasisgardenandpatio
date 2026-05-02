import { Switch, Route } from "wouter";
import { RequireStaff } from "./RequireStaff";
import { StaffShell } from "./StaffShell";
import StaffLogin from "./pages/StaffLogin";
import Setup2FA from "./pages/Setup2FA";
import Verify2FA from "./pages/Verify2FA";
import ChangePassword from "./pages/ChangePassword";
import AdminDashboard from "./pages/admin/Dashboard";
import AgentDashboard from "./pages/agent/Dashboard";
import { PagePlaceholder } from "./pages/PagePlaceholder";

const ADMIN_PLACEHOLDERS: Array<{ path: string; title: string; comingIn: string }> = [
  { path: "/admin/notifications", title: "Notifications", comingIn: "Phase 6.18" },
  { path: "/admin/orders", title: "Orders", comingIn: "Phase 6.21" },
  { path: "/admin/vendor-orders", title: "Vendor Orders", comingIn: "Phase 6.22" },
  { path: "/admin/customers", title: "Customers", comingIn: "Phase 6.17" },
  { path: "/admin/discounts", title: "Discounts", comingIn: "Phase 6.16" },
  { path: "/admin/products", title: "Products", comingIn: "Phase 6.8" },
  { path: "/admin/categories", title: "Categories", comingIn: "Phase 6.6" },
  { path: "/admin/sets", title: "Product Sets", comingIn: "Phase 6.10" },
  { path: "/admin/inventory", title: "Inventory", comingIn: "Phase 6.11" },
  { path: "/admin/manufacturers", title: "Manufacturers", comingIn: "Phase 6.5" },
  { path: "/admin/carriers", title: "Carriers", comingIn: "Phase 6.12" },
  { path: "/admin/banners", title: "Site Banners", comingIn: "Phase 6.13" },
  { path: "/admin/legal", title: "Legal Pages", comingIn: "Phase 6.14" },
  { path: "/admin/reports", title: "Reports", comingIn: "Phase 6.23" },
  { path: "/admin/users", title: "Users", comingIn: "Phase 6.17" },
  { path: "/admin/audit-log", title: "Audit Log", comingIn: "Phase 6.19" },
  { path: "/admin/settings", title: "Settings", comingIn: "Phase 6.15" },
];

const AGENT_PLACEHOLDERS: Array<{ path: string; title: string; comingIn: string }> = [
  { path: "/agent/new-order", title: "New Order", comingIn: "Phase 6.24" },
  { path: "/agent/orders", title: "My Orders", comingIn: "Phase 6.24" },
  { path: "/agent/customers", title: "Customers", comingIn: "Phase 6.24" },
  { path: "/agent/products", title: "Product Catalog", comingIn: "Phase 6.24" },
  { path: "/agent/inventory", title: "Inventory", comingIn: "Phase 6.24" },
  { path: "/agent/reports", title: "My Reports", comingIn: "Phase 6.24" },
];

export default function StaffRouter() {
  return (
    <Switch>
      {/* Public staff auth routes (no shell) */}
      <Route path="/staff" component={StaffLogin} />
      <Route path="/staff/setup-2fa" component={Setup2FA} />
      <Route path="/staff/verify-2fa" component={Verify2FA} />
      <Route path="/staff/change-password" component={ChangePassword} />

      {/* Admin routes (require admin role + shell) */}
      <Route path="/admin/:rest*">
        <RequireStaff requireRole="admin">
          {(user) => (
            <StaffShell user={user}>
              <Switch>
                <Route path="/admin">{() => <AdminDashboard user={user} />}</Route>
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

      {/* Agent routes (any staff) */}
      <Route path="/agent/:rest*">
        <RequireStaff>
          {(user) => (
            <StaffShell user={user}>
              <Switch>
                <Route path="/agent">{() => <AgentDashboard user={user} />}</Route>
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
