import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./docs/swagger";
import { errorHandler } from "./middleware/errorHandler";
import { stringifyIdsMiddleware } from "./middleware/stringifyIds";

import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import lookupsRoutes from "./routes/lookups";
import clientsRoutes from "./routes/clients";
import projectsRoutes from "./routes/projects";
import projectTasksRoutes from "./routes/projectTasks";
import pillarsRoutes from "./routes/pillars";
import timesheetsRoutes from "./routes/timesheets";
import approvalsRoutes from "./routes/approvals";
import notificationsRoutes from "./routes/notifications";
import reportsRoutes from "./routes/reports";
import auditLogsRoutes from "./routes/auditLogs";
import settingsRoutes from "./routes/settings";
import dashboardRoutes from "./routes/dashboard";
import holidaysRoutes from "./routes/holidays";
import holidayCalendarsRoutes from "./routes/holidayCalendars";
import clientSendsRoutes from "./routes/clientSends";
import delegationsRoutes from "./routes/delegations";

export function createApp() {
  const app = express();

  // contentSecurityPolicy is disabled because this process serves no HTML of
  // its own besides the Swagger UI (whose inline bootstrap script a strict
  // CSP would block) — every other route returns JSON. The SPA is a
  // separate origin (Vite) with its own CSP concerns.
  app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173", credentials: true }));
  app.use(morgan("dev"));
  app.use(express.json({ limit: "2mb" }));
  app.use(stringifyIdsMiddleware);

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "timesync-api" }));

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api/docs.json", (_req, res) => res.json(swaggerSpec));

  const v1 = express.Router();
  v1.use("/auth", authRoutes);
  v1.use("/users", usersRoutes);
  v1.use("/", lookupsRoutes); // /departments, /roles
  v1.use("/clients", clientsRoutes);
  v1.use("/projects", projectsRoutes);
  v1.use("/project-tasks", projectTasksRoutes);
  v1.use("/pillars", pillarsRoutes);
  v1.use("/timesheets", timesheetsRoutes);
  v1.use("/approvals", approvalsRoutes);
  v1.use("/notifications", notificationsRoutes);
  v1.use("/reports", reportsRoutes);
  v1.use("/audit-logs", auditLogsRoutes);
  v1.use("/settings", settingsRoutes);
  v1.use("/dashboard", dashboardRoutes);
  v1.use("/holidays", holidaysRoutes);
  v1.use("/holiday-calendars", holidayCalendarsRoutes);
  v1.use("/client-sends", clientSendsRoutes);
  v1.use("/delegations", delegationsRoutes);
  app.use("/api/v1", v1);

  app.use((_req, res) => {
    res.status(404).json({ statusCode: 404, message: "Not found", errorCode: "NOT_FOUND", details: null });
  });

  app.use(errorHandler);

  return app;
}
