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

import crypto from "crypto";

export function validateWebhookSignature(
  body: any,
  signature: string | undefined,
  appSecret: string
): boolean {
  if (!signature) {
    return false;
  }

  const elements = signature.split("=");
  const signatureHash = elements[1];
  const expectedHash = crypto
    .createHmac("sha256", appSecret)
    .update(JSON.stringify(body))
    .digest("hex");

  return signatureHash === expectedHash;
}

export function getWebhookVerifyToken(): string {
  return process.env.WEBHOOK_VERIFY_TOKEN || "your_webhook_verify_token";
}
