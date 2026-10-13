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

import type { Express } from 'express';
import { diployLogger, HTTP_STATUS, DIPLOY_BRAND } from "@diploy/core";
import { getMessageLogs, updateMessageStatus } from '../controllers/messages.logs.controller';
import { requireAuth } from '../middlewares/auth.middleware';

export function registerMessageLogsRoutes(app: Express) {
  app.get('/api/messages/logs', requireAuth, getMessageLogs);

  app.put('/api/messages/:messageId/status', requireAuth, updateMessageStatus);
}