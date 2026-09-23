import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute, RoleRoute } from "./routes/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TimesheetPeriodPage from "./pages/TimesheetPeriodPage";
import TimesheetWeeklyPage from "./pages/TimesheetWeeklyPage";
import TimesheetDayPage from "./pages/TimesheetDayPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import ProjectsPage from "./pages/ProjectsPage";
import UsersPage from "./pages/UsersPage";
import BulkUploadPage from "./pages/BulkUploadPage";
import ReportsPage from "./pages/ReportsPage";
import NotificationsPage from "./pages/NotificationsPage";
import SettingsPage from "./pages/SettingsPage";
import HolidaysPage from "./pages/HolidaysPage";
import ClientSendPage from "./pages/ClientSendPage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route path="/timesheets" element={<TimesheetPeriodPage kind="month" />} />
          <Route path="/timesheets/fortnight" element={<TimesheetPeriodPage kind="fortnight" />} />
          <Route path="/timesheets/weekly" element={<TimesheetWeeklyPage />} />
          <Route path="/timesheets/day" element={<TimesheetDayPage />} />

          <Route element={<RoleRoute roles={["PROJECT_ADMIN", "SUPER_ADMIN"]} />}>
            <Route path="/approvals" element={<ApprovalsPage />} />
          </Route>

          <Route path="/projects" element={<ProjectsPage />} />

          <Route element={<RoleRoute roles={["PROJECT_ADMIN", "SUPER_ADMIN"]} />}>
            <Route path="/projects/:id/client-send" element={<ClientSendPage />} />
          </Route>

          <Route element={<RoleRoute roles={["SUPER_ADMIN", "HR_ADMIN", "PROJECT_ADMIN", "INDIVIDUAL_USER"]} />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>

          <Route element={<RoleRoute roles={["SUPER_ADMIN", "HR_ADMIN"]} />}>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/holidays" element={<HolidaysPage />} />
          </Route>

          <Route element={<RoleRoute roles={["SUPER_ADMIN", "HR_ADMIN", "PROJECT_ADMIN"]} />}>
            <Route path="/bulk-upload" element={<BulkUploadPage />} />
          </Route>

          <Route path="/notifications" element={<NotificationsPage />} />

          <Route element={<RoleRoute roles={["SUPER_ADMIN"]} />}>
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
