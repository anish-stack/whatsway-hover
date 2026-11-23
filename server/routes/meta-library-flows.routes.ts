import type { Express } from "express";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";
import { resolveTenantChannels } from "../middlewares/tenant.middleware";
import { PERMISSIONS } from "@shared/schema";
import * as c from "../controllers/meta-library-flows.controller";

export function registerMetaLibraryFlowsRoutes(app: Express) {
  const base = [requireAuth, resolveTenantChannels];
  app.get("/api/templates/library", ...base, requirePermission(PERMISSIONS.TEMPLATES_VIEW), c.listLibraryTemplates);
  app.post("/api/templates/library", ...base, requirePermission(PERMISSIONS.TEMPLATES_CREATE), c.createFromLibrary);

  app.get("/api/whatsapp/flows", ...base, requirePermission(PERMISSIONS.TEMPLATES_VIEW), c.listFlows);
  app.get("/api/whatsapp/flows/:flowId", ...base, requirePermission(PERMISSIONS.TEMPLATES_VIEW), c.getFlowDetails);
  app.post("/api/whatsapp/flows/send", ...base, c.sendFlowMessage);
}
