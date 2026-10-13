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

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

function readVersionFile(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(__dirname, "..", "..", "VERSION"),
      resolve(process.cwd(), "VERSION"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        return readFileSync(p, "utf-8").trim();
      }
    }
    return "3.0.0";
  } catch {
    return "3.0.0";
  }
}

export const DIPLOY_PRODUCT_NAME = "Hover Business Services LLP";
export const DIPLOY_VERSION = readVersionFile();
export const DIPLOY_AUTHOR = "Hover Business Services LLP";
export const DIPLOY_WEBSITE = "https://hoverbusinessservices.com";
export const DIPLOY_SUPPORT_EMAIL = "info@hovermedia.in";
export const DIPLOY_SUPPORT_URL = "https://hoverbusinessservices.com";
export const DIPLOY_LICENSE = "Hover Business Services LLP";

export const DIPLOY_POWERED_BY = `${DIPLOY_PRODUCT_NAME} v${DIPLOY_VERSION}`;
export const DIPLOY_HEADER_KEY = "X-Powered-By";
export const DIPLOY_HEADER_VALUE = DIPLOY_POWERED_BY;

export const DIPLOY_BRAND = {
  name: DIPLOY_PRODUCT_NAME,
  version: DIPLOY_VERSION,
  author: DIPLOY_AUTHOR,
  website: DIPLOY_WEBSITE,
  support: DIPLOY_SUPPORT_EMAIL,
  license: DIPLOY_LICENSE,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
