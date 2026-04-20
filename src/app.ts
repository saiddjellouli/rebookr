import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { requireOrgScope } from "./auth/preHandlers.js";
import { registerJwt } from "./plugins/jwtPlugin.js";
import { appointmentNoShowRoutes } from "./routes/appointmentNoShow.js";
import { appointmentsListRoutes } from "./routes/appointmentsList.js";
import { authRoutes } from "./routes/auth.js";
import { authUiRoutes } from "./routes/authUi.js";
import { csvImportRoutes } from "./routes/csvImport.js";
import { imageImportRoutes } from "./routes/imageImport.js";
import { textImportRoutes } from "./routes/textImport.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { demoRoutes } from "./routes/demo.js";
import { dashboardUiRoutes } from "./routes/dashboardUi.js";
import { healthRoutes } from "./routes/health.js";
import { inboundEmailRoutes } from "./routes/inboundEmail.js";
import { inboundEmailAdminRoutes } from "./routes/inboundEmailAdmin.js";
import { internalCronRoutes } from "./routes/internalCron.js";
import { orgUsersRoutes } from "./routes/orgUsers.js";
import { poolRoutes } from "./routes/pool.js";
import { publicActionRoutes } from "./routes/publicActions.js";
import { publicRebookRoutes } from "./routes/publicRebook.js";
import { waitlistRoutes } from "./routes/waitlist.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, { origin: true });
  await registerJwt(app);

  await app.register(authUiRoutes);
  await app.register(dashboardUiRoutes);

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(publicActionRoutes, { prefix: "/api" });
  await app.register(publicRebookRoutes, { prefix: "/api" });
  await app.register(inboundEmailRoutes, { prefix: "/api" });
  await app.register(internalCronRoutes, { prefix: "/api" });

  await app.register(async (scoped) => {
    scoped.addHook("preHandler", requireOrgScope);
    await scoped.register(multipart, {
      limits: { fileSize: 12 * 1024 * 1024 },
    });
    await scoped.register(csvImportRoutes, { prefix: "/api" });
    await scoped.register(imageImportRoutes, { prefix: "/api" });
    await scoped.register(textImportRoutes, { prefix: "/api" });
    await scoped.register(appointmentNoShowRoutes, { prefix: "/api" });
    await scoped.register(appointmentsListRoutes, { prefix: "/api" });
    await scoped.register(waitlistRoutes, { prefix: "/api" });
    await scoped.register(dashboardRoutes, { prefix: "/api" });
    await scoped.register(demoRoutes, { prefix: "/api" });
    await scoped.register(orgUsersRoutes, { prefix: "/api" });
    await scoped.register(poolRoutes, { prefix: "/api" });
    await scoped.register(inboundEmailAdminRoutes, { prefix: "/api" });
  });

  return app;
}
