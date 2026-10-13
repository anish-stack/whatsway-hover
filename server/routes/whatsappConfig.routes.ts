/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 *
  
 *
  
 * ============================================================
 */

import { Express } from "express";
import { diployLogger, HTTP_STATUS, DIPLOY_BRAND } from "@diploy/core";
import {
  saveWhatsappConfig,
  getMyWhatsappConfig,
  updateWhatsappConfig,
  deleteWhatsappConfig,
} from "../controllers/whatsappConfig.controller";
import { requireAuth, requireRole } from
  "server/middlewares/auth.middleware";

export function registerWhatsappConfigRoutes(
  app: Express
) {

  // Get config (all authenticated users can read - needed for embedded signup flow)
  app.get(
    "/api/embedded/config",
    requireAuth,
    getMyWhatsappConfig
  );

  // Create / Update (superadmin only)
  app.post(
    "/api/embedded/config",
    requireAuth,
    requireRole("superadmin"),
    saveWhatsappConfig
  );

  // Update by id (superadmin only)
  app.put(
    "/api/embedded/config/:id",
    requireAuth,
    requireRole("superadmin"),
    updateWhatsappConfig
  );

  // Delete (superadmin only)
  app.delete(
    "/api/embedded/config",
    requireAuth,
    requireRole("superadmin"),
    deleteWhatsappConfig
  );
}
