import { FC, ReactNode, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { AssistantWidget } from "@/components/assistant-widget";
import { AmbientBackground } from "@/components/ambient-background";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: FC<AppLayoutProps> = ({ children }) => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [location] = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // On every route change, jump the scroller back to the top so each page starts fresh.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [location]);

  if (!isAuthenticated) {
    return <div className="min-h-screen bg-background flex flex-col">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row relative">
      {/* Interactive ambient backdrop shared across all pages */}
      <AmbientBackground />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <Header />
        <main
          ref={mainRef}
          className={`flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${isAdmin ? "admin-portal" : "member-portal"}`}
        >
          {/* keyed wrapper → quick GPU fade/slide on each navigation */}
          <div key={location} className="animate-page">
            {children}
          </div>
        </main>
      </div>
      <AssistantWidget />
    </div>
  );
};
