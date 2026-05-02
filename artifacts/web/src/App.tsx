import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";
import NotFound from "@/pages/not-found";

import Home from "@/pages/Home";
import Contact from "@/pages/Contact";
import ComingSoon from "@/pages/ComingSoon";
import LegalDocument from "@/pages/LegalDocument";

const queryClient = new QueryClient();

function Router() {
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
        <Route path="/login" component={ComingSoon} />
        
        {/* 404 */}
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
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
