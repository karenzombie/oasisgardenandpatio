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
  { path: "/notifications", title: "Notifications", comingIn: "Phase 6.18" },
  { path: "/orders", title: "Orders", comingIn: "Phase 6.21" },
  { path: "/vendor-orders", title: "Vendor Orders", comingIn: "Phase 6.22" },
  { path: "/customers", title: "Customers", comingIn: "Phase 6.17" },
  { path: "/discounts", title: "Discounts", comingIn: "Phase 6.16" },
  { path: "/products", title: "Products", comingIn: "Phase 6.8" },
  { path: "/categories", title: "Categories", comingIn: "Phase 6.6" },
  { path: "/sets", title: "Product Sets", comingIn: "Phase 6.10" },
  { path: "/inventory", title: "Inventory", comingIn: "Phase 6.11" },
  { path: "/manufacturers", title: "Manufacturers", comingIn: "Phase 6.5" },
  { path: "/carriers", title: "Carriers", comingIn: "Phase 6.12" },
  { path: "/banners", title: "Site Banners", comingIn: "Phase 6.13" },
  { path: "/legal", title: "Legal Pages", comingIn: "Phase 6.14" },
  { path: "/reports", title: "Reports", comingIn: "Phase 6.23" },
  { path: "/users", title: "Users", comingIn: "Phase 6.17" },
  { path: "/audit-log", title: "Audit Log", comingIn: "Phase 6.19" },
  { path: "/settings", title: "Settings", comingIn: "Phase 6.15" },
];

const AGENT_PLACEHOLDERS: Array<{ path: string; title: string; comingIn: string }> = [
  { path: "/new-order", title: "New Order", comingIn: "Phase 6.24" },
  { path: "/orders", title: "My Orders", comingIn: "Phase 6.24" },
  { path: "/customers", title: "Customers", comingIn: "Phase 6.24" },
  { path: "/products", title: "Product Catalog", comingIn: "Phase 6.24" },
  { path: "/inventory", title: "Inventory", comingIn: "Phase 6.24" },
  { path: "/reports", title: "My Reports", comingIn: "Phase 6.24" },
];

export default function StaffRouter() {
  return (
    <Switch>
      {/* Public staff auth routes (no shell) */}
      <Route path="/staff" component={StaffLogin} />
      <Route path="/staff/setup-2fa" component={Setup2FA} />
      <Route path="/staff/verify-2fa" component={Verify2FA} />
      <Route path="/staff/change-password" component={ChangePassword} />

      {/* Admin section (matches /admin and /admin/*) */}
      <Route path="/admin" nest>
        <RequireStaff requireRole="admin">
          {(user) => (
            <StaffShell user={user}>
              <Switch>
                <Route path="/">{() => <AdminDashboard user={user} />}</Route>
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
                <Route path="/">{() => <AgentDashboard user={user} />}</Route>
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
