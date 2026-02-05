import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/error-boundary";
import LoginPage from "@/pages/login";
import ProfilePage from "@/pages/profile";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

const Workbench = lazy(() => import("@/pages/workbench"));

function WorkbenchWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading workbench...</p>
        </div>
      </div>
    }>
      <Workbench />
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={WorkbenchWrapper} />
      <Route path="/login" component={LoginPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
