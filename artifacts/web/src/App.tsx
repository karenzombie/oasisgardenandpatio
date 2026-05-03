import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";
import NotFound from "@/pages/not-found";

import Home from "@/pages/Home";
import Contact from "@/pages/Contact";
import ComingSoon from "@/pages/ComingSoon";
import Shop from "@/pages/Shop";
import Product from "@/pages/Product";
import ShippingReturns from "@/pages/ShippingReturns";
import Warranty from "@/pages/Warranty";
import Fabrics from "@/pages/Fabrics";
import Materials from "@/pages/Materials";
import Manufacturers from "@/pages/Manufacturers";
import Cushions from "@/pages/Cushions";
import LegalDocument from "@/pages/LegalDocument";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import Account from "@/pages/Account";
import AccountWishlist from "@/pages/AccountWishlist";
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
        <Route path="/privacy-policy">
          {() => <LegalDocument type="privacy_policy" />}
        </Route>
        <Route path="/terms-and-conditions">
          {() => <LegalDocument type="terms_and_conditions" />}
        </Route>

        {/* Placeholder Routes */}
        <Route path="/manufacturers" component={Manufacturers} />
        <Route path="/materials" component={Materials} />
        <Route path="/shop" component={Shop} />
        <Route path="/shop/category/:slug" component={Shop} />
        <Route path="/shop/:slug" component={Product} />
        <Route path="/shipping-returns" component={ShippingReturns} />
        <Route path="/warranty" component={Warranty} />
        <Route path="/fabrics" component={Fabrics} />
        <Route path="/commercial" component={ComingSoon} />
        <Route path="/cushions" component={Cushions} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/account" component={Account} />
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
