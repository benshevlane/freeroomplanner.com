import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";

const Landing = lazy(() => import("@/pages/Landing"));
const Editor = lazy(() => import("@/pages/Editor"));
const Embed = lazy(() => import("@/pages/Embed"));
const GetEmbed = lazy(() => import("@/pages/GetEmbed"));
const Admin = lazy(() => import("@/pages/Admin"));

function AppRouter() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/app" component={Editor} />
        <Route path="/embed" component={Embed} />
        <Route path="/get-embed" component={GetEmbed} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <AppRouter />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
