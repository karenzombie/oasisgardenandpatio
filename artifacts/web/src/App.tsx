import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";
import NotFound from "@/pages/not-found";

import Home from "@/pages/Home";
import Contact from "@/pages/Contact";
import ComingSoon from "@/pages/ComingSoon";
import LegalDocument from "@/pages/LegalDocument";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import Account from "@/pages/Account";

import StaffRouter from "@/staff/StaffRouter";

const queryClient = new QueryClient();

function CustomerRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/contact" component={Contact} />
        <Route path="/privacy-policy">
          {() => <LegalDocument type="privacy_policy" />}
        </Route>
        <Route path="/terms-and-conditions">
          {() => <LegalDocument type="terms_and_conditions" />}
        </Route>

        {/* Placeholder Routes */}
        <Route path="/manufacturers" component={ComingSoon} />
        <Route path="/materials" component={ComingSoon} />
        <Route path="/shop" component={ComingSoon} />
        <Route path="/shop/:id" component={ComingSoon} />
        <Route path="/commercial" component={ComingSoon} />
        <Route path="/cushions" component={ComingSoon} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/account" component={Account} />

        {/* 404 */}
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Router() {
  const [loc] = useLocation();
  const isStaff =
    loc === "/staff" ||
    loc.startsWith("/staff/") ||
    loc === "/admin" ||
    loc.startsWith("/admin/") ||
    loc === "/agent" ||
    loc.startsWith("/agent/");

  return isStaff ? <StaffRouter /> : <CustomerRouter />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
