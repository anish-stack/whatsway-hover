import type { Express } from "express";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";
import { resolveTenantChannels } from "../middlewares/tenant.middleware";
import { PERMISSIONS } from "@shared/schema";
import * as c from "../controllers/meta-library-flows.controller";
import { aiTemplateTurn } from "../services/ai-template.service";
import { verifyChannelOwnership } from "../middlewares/tenant.middleware";

export function registerMetaLibraryFlowsRoutes(app: Express) {
  const base = [requireAuth, resolveTenantChannels];
  app.get("/api/templates/library", ...base, requirePermission(PERMISSIONS.TEMPLATES_VIEW), c.listLibraryTemplates);
  app.post("/api/templates/library", ...base, requirePermission(PERMISSIONS.TEMPLATES_CREATE), c.createFromLibrary);

  // "Make with AI": one interview turn → a question or a finished template
  app.post("/api/templates/ai-generate", ...base, requirePermission(PERMISSIONS.TEMPLATES_CREATE), async (req, res) => {
    try {
      const { channelId, messages, language } = req.body || {};
      if (channelId && !verifyChannelOwnership(req, String(channelId))) return res.status(403).json({ error: "Channel not accessible" });
      const msgs = Array.isArray(messages) ? messages.filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") : [];
      if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "Describe the message you want to send." });
      res.json(await aiTemplateTurn(channelId ? String(channelId) : undefined, msgs, language));
    } catch (e: any) {
      const status = e?.status || (/api key|401|403|invalid/i.test(e?.message || "") ? 400 : 500);
      res.status(status).json({ error: status >= 500 ? "AI request failed. Please try again." : e.message });
    }
  });

  app.get("/api/whatsapp/flows", ...base, requirePermission(PERMISSIONS.TEMPLATES_VIEW), c.listFlows);
  app.get("/api/whatsapp/flows/:flowId", ...base, requirePermission(PERMISSIONS.TEMPLATES_VIEW), c.getFlowDetails);
  app.post("/api/whatsapp/flows/send", ...base, c.sendFlowMessage);
}
