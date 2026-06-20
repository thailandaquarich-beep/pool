import { FC, ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { AssistantWidget } from "@/components/assistant-widget";
import { AmbientBackground } from "@/components/ambient-background";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: FC<AppLayoutProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();

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
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <AssistantWidget />
    </div>
  );
};