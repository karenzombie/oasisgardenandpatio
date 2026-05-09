import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";
import NotFound from "@/pages/not-found";
import { trackVisitOnce } from "@/lib/analytics";
import { useDrainPendingWishlistOnLogin } from "@/lib/auth";
import { useClerkSync } from "@/lib/useClerkSync";
import { clerkAppearance } from "@/lib/clerkAppearance";
import { SignInPage, SignUpPage } from "@/pages/auth/ClerkAuthPages";

import Home from "@/pages/Home";
import Contact from "@/pages/Contact";
import ComingSoon from "@/pages/ComingSoon";
import Shop from "@/pages/Shop";
import Product from "@/pages/Product";
import ShippingReturns from "@/pages/ShippingReturns";
import Fabrics from "@/pages/Fabrics";
import Materials from "@/pages/Materials";
import Manufacturers from "@/pages/Manufacturers";
import Commercial from "@/pages/Commercial";
import Cushions from "@/pages/Cushions";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsAndConditions from "@/pages/TermsAndConditions";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import Account from "@/pages/Account";
import AccountWishlist from "@/pages/AccountWishlist";
import Wishlist from "@/pages/Wishlist";
import AccountAddresses from "@/pages/AccountAddresses";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import OrderConfirmation from "@/pages/OrderConfirmation";
import AccountOrders from "@/pages/AccountOrders";
import AccountOrderDetail from "@/pages/AccountOrderDetail";

import StaffRouter from "@/staff/StaffRouter";

const queryClient = new QueryClient();

function CustomerRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/contact" component={Contact} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/terms-and-conditions" component={TermsAndConditions} />

        {/* Placeholder Routes */}
        <Route path="/manufacturers" component={Manufacturers} />
        <Route path="/materials" component={Materials} />
        <Route path="/shop" component={Shop} />
        <Route path="/shop/category/:slug" component={Shop} />
        <Route path="/shop/:slug" component={Product} />
        <Route path="/shipping-returns" component={ShippingReturns} />
        <Route path="/warranty">{() => <ComingSoon />}</Route>
        <Route path="/fabrics" component={Fabrics} />
        <Route path="/commercial" component={Commercial} />
        <Route path="/cushions" component={Cushions} />
        {/* Legacy /login and /signup routes redirect to the Clerk-backed
            sign-in / sign-up flow. */}
        <Route path="/login">
          <Redirect to="/sign-in" />
        </Route>
        <Route path="/signup">
          <Redirect to="/sign-up" />
        </Route>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/account" component={Account} />
        <Route path="/wishlist" component={Wishlist} />
        <Route path="/account/wishlist" component={AccountWishlist} />
        <Route path="/account/addresses" component={AccountAddresses} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/order-confirmation/:orderNumber" component={OrderConfirmation} />
        <Route path="/account/orders" component={AccountOrders} />
        <Route path="/account/orders/:orderNumber" component={AccountOrderDetail} />

        {/* 404 */}
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function CustomerArea() {
  // Bridge Clerk → local session, then drain any guest wishlist held in
  // localStorage. Both effects must mount inside ClerkProvider.
  useClerkSync();
  useDrainPendingWishlistOnLogin();
  return <CustomerRouter />;
}

function CustomerWithClerk() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/`}
      signUpFallbackRedirectUrl={`${basePath}/`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <CustomerArea />
    </ClerkProvider>
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

  // Staff portal keeps its own email/password + 2FA flow and is intentionally
  // NOT wrapped in ClerkProvider. Customer routes mount Clerk + the
  // session bridge.
  return isStaff ? <StaffRouter /> : <CustomerWithClerk />;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  typeof window !== "undefined" ? window.location.hostname : "",
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function App() {
  useEffect(() => {
    trackVisitOnce();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
