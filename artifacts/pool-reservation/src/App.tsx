import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { CartProvider } from "@/hooks/use-cart";
import { LanguageProvider } from "@/i18n";
import { ThemeProvider } from "@/hooks/use-theme";
import { ThemeColorProvider } from "@/components/theme-color-provider";
import { AppLayout } from "@/components/layout/app-layout";
import { LandingPopup } from "@/components/LandingPopup";
const NotFound = lazy(() => import("@/pages/not-found"));
const Landing = lazy(() => import("@/pages/landing").then((m) => ({ default: m.Landing })));
const Login = lazy(() => import("@/pages/login").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("@/pages/register").then((m) => ({ default: m.Register })));
const Dashboard = lazy(() => import("@/pages/dashboard").then((m) => ({ default: m.Dashboard })));
const Reservations = lazy(() => import("@/pages/reservations").then((m) => ({ default: m.Reservations })));
const Book = lazy(() => import("@/pages/book").then((m) => ({ default: m.Book })));
const Calendar = lazy(() => import("@/pages/calendar").then((m) => ({ default: m.Calendar })));
const MemberInstructors = lazy(() => import("@/pages/instructors").then((m) => ({ default: m.MemberInstructors })));
const InstructorSchedule = lazy(() => import("@/pages/instructor/schedule").then((m) => ({ default: m.InstructorSchedule })));
const MembershipCard = lazy(() => import("@/pages/membership-card").then((m) => ({ default: m.MembershipCard })));
const Profile = lazy(() => import("@/pages/profile").then((m) => ({ default: m.Profile })));
const WalletPage = lazy(() => import("@/pages/wallet").then((m) => ({ default: m.WalletPage })));
const Topup = lazy(() => import("@/pages/topup").then((m) => ({ default: m.Topup })));
const Packages = lazy(() => import("@/pages/packages").then((m) => ({ default: m.Packages })));
const MyPackages = lazy(() => import("@/pages/my-packages").then((m) => ({ default: m.MyPackages })));
const Products = lazy(() => import("@/pages/products").then((m) => ({ default: m.Products })));
const Services = lazy(() => import("@/pages/services").then((m) => ({ default: m.Services })));
const Cart = lazy(() => import("@/pages/cart").then((m) => ({ default: m.Cart })));
const MyOrders = lazy(() => import("@/pages/my-orders").then((m) => ({ default: m.MyOrders })));
const ChatPage = lazy(() => import("@/pages/chat").then((m) => ({ default: m.ChatPage })));
const Attendance = lazy(() => import("@/pages/attendance").then((m) => ({ default: m.Attendance })));
const StaffTasks = lazy(() => import("@/pages/staff/tasks").then((m) => ({ default: m.StaffTasks })));
const LeavePage = lazy(() => import("@/pages/leave").then((m) => ({ default: m.LeavePage })));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard").then((m) => ({ default: m.AdminDashboard })));
const AdminMembers = lazy(() => import("@/pages/admin/members").then((m) => ({ default: m.AdminMembers })));
const AdminReservations = lazy(() => import("@/pages/admin/reservations").then((m) => ({ default: m.AdminReservations })));
const AdminSettings = lazy(() => import("@/pages/admin/settings").then((m) => ({ default: m.AdminSettings })));
const AdminFacilities = lazy(() => import("@/pages/admin/facilities").then((m) => ({ default: m.AdminFacilities })));
const AdminInstructors = lazy(() => import("@/pages/admin/instructors").then((m) => ({ default: m.AdminInstructors })));
const AdminCheckinScan = lazy(() => import("@/pages/admin/checkin-scan").then((m) => ({ default: m.AdminCheckinScan })));
const AdminAnnouncements = lazy(() => import("@/pages/admin/announcements").then((m) => ({ default: m.AdminAnnouncements })));
const AdminWalletManagement = lazy(() => import("@/pages/admin/wallet-management").then((m) => ({ default: m.AdminWalletManagement })));
const AdminSales = lazy(() => import("@/pages/admin/sales").then((m) => ({ default: m.AdminSales })));
const AdminAiChat = lazy(() => import("@/pages/admin/ai-chat").then((m) => ({ default: m.AdminAiChat })));
const AdminTheme = lazy(() => import("@/pages/admin/theme").then((m) => ({ default: m.AdminTheme })));
const AdminAttendance = lazy(() => import("@/pages/admin/attendance").then((m) => ({ default: m.AdminAttendance })));
const AdminWorkPlan = lazy(() => import("@/pages/admin/work-plan").then((m) => ({ default: m.AdminWorkPlan })));
const AdminLeave = lazy(() => import("@/pages/admin/leave").then((m) => ({ default: m.AdminLeave })));
const AdminBranches = lazy(() => import("@/pages/admin/branches").then((m) => ({ default: m.AdminBranches })));
const AdminOverview = lazy(() => import("@/pages/admin/overview").then((m) => ({ default: m.AdminOverview })));
const AdminHelpCenter = lazy(() => import("@/pages/admin/help-center").then((m) => ({ default: m.AdminHelpCenter })));
const AdminAuditLogs = lazy(() => import("@/pages/admin/audit-logs").then((m) => ({ default: m.AdminAuditLogs })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      // Keep data fresh "real-time": auto-refresh on focus and on a steady interval.
      refetchOnWindowFocus: true,
      refetchInterval: 30000, // poll every 30s while the tab is open
      staleTime: 10000,
    },
  },
});

const ProtectedRoute = ({ component: Component, adminOnly = false, instructorOnly = false, staffOnly = false, allowInstructor = false, ...rest }: any) => {
  const { isAuthenticated, isLoading, isAdmin, isInstructor, isStaff } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!isAuthenticated) return <Redirect to="/" />;
  if (adminOnly && !isAdmin) return <Redirect to="/dashboard" />;
  if (instructorOnly && !isInstructor && !isAdmin) return <Redirect to="/dashboard" />;
  // staffOnly = any worker (admin / instructor / employee) — e.g. the attendance clock
  if (staffOnly && !isAdmin && !isInstructor && !isStaff) return <Redirect to="/dashboard" />;
  // instructors get the full member experience PLUS their teaching schedule (no confinement)
  if (!adminOnly && isAdmin && rest.path === "/dashboard") return <Redirect to="/admin" />;
  // employees (staff) have no member dashboard — send them to their clock
  if (isStaff && rest.path === "/dashboard") return <Redirect to="/attendance" />;
  return <Component />;
};

function Router() {
  const { isAuthenticated, isLoading, isAdmin, isInstructor, isStaff } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  const home = isAdmin ? "/admin" : isStaff ? "/attendance" : "/dashboard";

  return (
    <AppLayout>
      <Switch>
        <Route path="/">
          {isAuthenticated ? <Redirect to={home} /> : <Landing />}
        </Route>
        <Route path="/login">
          {isAuthenticated ? <Redirect to={home} /> : <Login />}
        </Route>
        <Route path="/register">
          {isAuthenticated ? <Redirect to={home} /> : <Register />}
        </Route>

        <Route path="/instructor/schedule"><ProtectedRoute component={InstructorSchedule} instructorOnly /></Route>
        <Route path="/tasks"><ProtectedRoute component={StaffTasks} staffOnly /></Route>
        <Route path="/attendance"><ProtectedRoute component={Attendance} staffOnly /></Route>
        <Route path="/leave"><ProtectedRoute component={LeavePage} staffOnly /></Route>

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
        <Route path="/my-packages"><ProtectedRoute component={MyPackages} /></Route>
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
        <Route path="/admin/packages"><ProtectedRoute component={AdminSales} adminOnly /></Route>
        <Route path="/admin/products"><ProtectedRoute component={AdminSales} adminOnly /></Route>
        <Route path="/admin/orders"><ProtectedRoute component={AdminSales} adminOnly /></Route>
        <Route path="/admin/ai-chat"><ProtectedRoute component={AdminAiChat} adminOnly /></Route>
        <Route path="/admin/theme"><ProtectedRoute component={AdminTheme} adminOnly /></Route>
        <Route path="/admin/work-plan"><ProtectedRoute component={AdminWorkPlan} adminOnly /></Route>
        <Route path="/admin/attendance"><ProtectedRoute component={AdminAttendance} adminOnly /></Route>
        <Route path="/admin/leave"><ProtectedRoute component={AdminLeave} adminOnly /></Route>
        <Route path="/admin/branches"><ProtectedRoute component={AdminBranches} adminOnly /></Route>
        <Route path="/admin/overview"><ProtectedRoute component={AdminOverview} adminOnly /></Route>
        <Route path="/admin/chat"><ProtectedRoute component={ChatPage} adminOnly /></Route>
        <Route path="/admin/help"><ProtectedRoute component={AdminHelpCenter} adminOnly /></Route>
        <Route path="/admin/audit-logs"><ProtectedRoute component={AdminAuditLogs} adminOnly /></Route>

        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemeColorProvider>
          <TooltipProvider>
            <AuthProvider>
              <LanguageProvider>
                <CartProvider>
                  <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                    <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                      <Router />
                    </Suspense>
                    <LandingPopup />
                  </WouterRouter>
                </CartProvider>
                <Toaster />
              </LanguageProvider>
            </AuthProvider>
          </TooltipProvider>
        </ThemeColorProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
