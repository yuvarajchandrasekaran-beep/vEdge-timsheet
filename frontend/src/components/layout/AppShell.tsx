import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useApprovalsPending } from "../../hooks/useApprovals";
import { PageHeaderProvider } from "../../hooks/usePageHeader";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ImpersonationBanner } from "./ImpersonationBanner";

export function AppShell() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const canApprove = user?.role === "PROJECT_ADMIN" || user?.role === "SUPER_ADMIN";
  const { data: approvals } = useApprovalsPending({ page: 1, pageSize: 1 }, canApprove);

  return (
    <PageHeaderProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-app-bg">
        <ImpersonationBanner />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar
            approvalsBadge={canApprove ? approvals?.meta.total ?? 0 : 0}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
            <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </PageHeaderProvider>
  );
}
