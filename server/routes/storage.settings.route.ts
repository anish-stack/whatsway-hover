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

import express from "express";
import { diployLogger, HTTP_STATUS, DIPLOY_BRAND } from "@diploy/core";
import {
  getStorageSettings,
  getActiveStorage,
  updateStorageSetting,
  deleteStorageSetting,
  activateStorage,
  testStorageConnection,
} from "../controllers/storage.settings.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import type { Express } from "express";

export function registerStorageSettingsRoutes(app: Express) {
  app.get("/api/storage-settings", requireAuth, requireRole("superadmin"), getStorageSettings);
  app.get("/api/storage-settings/active", requireAuth, requireRole("superadmin"), getActiveStorage);
  app.post("/api/storage-settings/update", requireAuth, requireRole("superadmin"), updateStorageSetting);
  app.post("/api/storage-settings/test", requireAuth, requireRole("superadmin"), testStorageConnection);
  app.post("/api/storage-settings/:id/activate", requireAuth, requireRole("superadmin"), activateStorage);
  app.delete("/api/storage-settings/:id", requireAuth, requireRole("superadmin"), deleteStorageSetting);
}
