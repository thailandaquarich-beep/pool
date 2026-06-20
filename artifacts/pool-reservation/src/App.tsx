import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { CartProvider } from "@/hooks/use-cart";
import { LanguageProvider } from "@/i18n";
import { ThemeProvider } from "@/hooks/use-theme";
import { AppLayout } from "@/components/layout/app-layout";
import NotFound from "@/pages/not-found";

import { Login } from "@/pages/login";
import { Register } from "@/pages/register";
import { Dashboard } from "@/pages/dashboard";
import { AdminDashboard } from "@/pages/admin/dashboard";
import { Reservations } from "@/pages/reservations";
import { Book } from "@/pages/book";
import { Calendar } from "@/pages/calendar";
import { MemberInstructors } from "@/pages/instructors";
import { InstructorSchedule } from "@/pages/instructor/schedule";
import { MembershipCard } from "@/pages/membership-card";
import { AdminCheckinScan } from "@/pages/admin/checkin-scan";
import { Profile } from "@/pages/profile";
import { WalletPage } from "@/pages/wallet";
import { Topup } from "@/pages/topup";
import { Packages } from "@/pages/packages";
import { Products } from "@/pages/products";
import { Services } from "@/pages/services";
import { Cart } from "@/pages/cart";
import { MyOrders } from "@/pages/my-orders";
import { ChatPage } from "@/pages/chat";

import { AdminMembers } from "@/pages/admin/members";
import { AdminReservations } from "@/pages/admin/reservations";
import { AdminSettings } from "@/pages/admin/settings";
import { AdminFacilities } from "@/pages/admin/facilities";
import { AdminInstructors } from "@/pages/admin/instructors";
import { AdminAnnouncements } from "@/pages/admin/announcements";
import { AdminWalletManagement } from "@/pages/admin/wallet-management";
import { AdminPackagesManagement } from "@/pages/admin/packages-management";
import { AdminProducts } from "@/pages/admin/products";
import { AdminOrders } from "@/pages/admin/orders";
import { AdminAiChat } from "@/pages/admin/ai-chat";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const ProtectedRoute = ({ component: Component, adminOnly = false, instructorOnly = false, allowInstructor = false, ...rest }: any) => {
  const { isAuthenticated, isLoading, isAdmin, isInstructor } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!isAuthenticated) return <Redirect to="/" />;
  if (adminOnly && !isAdmin) return <Redirect to="/dashboard" />;
  if (instructorOnly && !isInstructor && !isAdmin) return <Redirect to="/dashboard" />;
  // instructors get the full member experience PLUS their teaching schedule (no confinement)
  if (!adminOnly && isAdmin && rest.path === "/dashboard") return <Redirect to="/admin" />;
  return <Component />;
};

function Router() {
  const { isAuthenticated, isLoading, isAdmin, isInstructor } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  const home = isAdmin ? "/admin" : "/dashboard";

  return (
    <AppLayout>
      <Switch>
        <Route path="/">
          {isAuthenticated ? <Redirect to={home} /> : <Login />}
        </Route>
        <Route path="/register">
          {isAuthenticated ? <Redirect to={home} /> : <Register />}
        </Route>

        <Route path="/instructor/schedule"><ProtectedRoute component={InstructorSchedule} instructorOnly /></Route>

        <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
        <Route path="/reservations"><ProtectedRoute component={Reservations} /></Route>
        <Route path="/book"><ProtectedRoute component={Book} /></Route>
        <Route path="/calendar"><ProtectedRoute component={Calendar} /></Route>
        <Route path="/instructors"><ProtectedRoute component={MemberInstructors} /></Route>
        <Route path="/membership-card"><ProtectedRoute component={MembershipCard} /></Route>
        <Route path="/profile"><ProtectedRoute component={Profile} allowInstructor /></Route>
        <Route path="/wallet"><ProtectedRoute component={WalletPage} /></Route>
        <Route path="/topup"><ProtectedRoute component={Topup} /></Route>
        <Route path="/packages"><ProtectedRoute component={Packages} /></Route>
        <Route path="/products"><ProtectedRoute component={Products} /></Route>
        <Route path="/services"><ProtectedRoute component={Services} /></Route>
        <Route path="/cart"><ProtectedRoute component={Cart} /></Route>
        <Route path="/my-orders"><ProtectedRoute component={MyOrders} /></Route>
        <Route path="/chat"><ProtectedRoute component={ChatPage} /></Route>

        <Route path="/admin"><ProtectedRoute component={AdminDashboard} adminOnly /></Route>
        <Route path="/admin/members"><ProtectedRoute component={AdminMembers} adminOnly /></Route>
        <Route path="/admin/reservations"><ProtectedRoute component={AdminReservations} adminOnly /></Route>
        <Route path="/admin/settings"><ProtectedRoute component={AdminSettings} adminOnly /></Route>
        <Route path="/admin/facilities"><ProtectedRoute component={AdminFacilities} adminOnly /></Route>
        <Route path="/admin/instructors"><ProtectedRoute component={AdminInstructors} adminOnly /></Route>
        <Route path="/admin/checkin"><ProtectedRoute component={AdminCheckinScan} adminOnly /></Route>
        <Route path="/admin/announcements"><ProtectedRoute component={AdminAnnouncements} adminOnly /></Route>
        <Route path="/admin/wallet"><ProtectedRoute component={AdminWalletManagement} adminOnly /></Route>
        <Route path="/admin/packages"><ProtectedRoute component={AdminPackagesManagement} adminOnly /></Route>
        <Route path="/admin/products"><ProtectedRoute component={AdminProducts} adminOnly /></Route>
        <Route path="/admin/orders"><ProtectedRoute component={AdminOrders} adminOnly /></Route>
        <Route path="/admin/ai-chat"><ProtectedRoute component={AdminAiChat} adminOnly /></Route>
        <Route path="/admin/chat"><ProtectedRoute component={ChatPage} adminOnly /></Route>

        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <LanguageProvider>
              <CartProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Router />
                </WouterRouter>
              </CartProvider>
              <Toaster />
            </LanguageProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
