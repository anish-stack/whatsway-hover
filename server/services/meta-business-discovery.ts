/**
 * WABA discovery via the customer's business portfolio.
 *
 * Fallback used by Embedded Signup only when `debug_token.granular_scopes`
 * does not expose the WABA id. These two Graph edges are the ONLY place the
 * app reads business-portfolio data, and they are the only reason
 * `business_management` is ever needed:
 *   GET /me?fields=businesses
 *   GET /{business-id}/owned_whatsapp_business_accounts
 *
 * Nothing else is requested. Tokens go in the Authorization header (never in
 * the URL) and are never logged. Response bodies are not logged.
 */

export type BusinessDiscoveryFailure =
  | "permission_denied" // token lacks business_management (or asset access)
  | "token_invalid" // expired / revoked token
  | "no_business" // call OK but no business portfolio returned
  | "no_waba" // business found but no WABA owned by it
  | "graph_error"; // any other Graph/network error

export interface BusinessDiscoveryResult {
  wabaId?: string;
  businessId?: string;
  failure?: BusinessDiscoveryFailure;
  graphErrorCode?: number;
  graphErrorMessage?: string;
}

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<{ json: () => Promise<any> }>;

// Graph codes: 10 = permission denied, 200-299 = permission errors,
// 100 w/ "missing permission" text, 190 = invalid/expired token.
function classifyGraphError(err: any): BusinessDiscoveryFailure {
  const code = Number(err?.code);
  const msg = String(err?.message || "").toLowerCase();
  if (code === 190) return "token_invalid";
  if (
    code === 10 ||
    (code >= 200 && code <= 299) ||
    msg.includes("permission") ||
    msg.includes("business_management")
  ) {
    return "permission_denied";
  }
  return "graph_error";
}

/**
 * `scopes` comes from debug_token.data.scopes. Returns:
 *  - true/false when the list is known
 *  - undefined when Meta returned no list (unknown → caller should just try)
 */
export function hasGrantedScope(
  scopes: unknown,
  scope: string
): boolean | undefined {
  if (!Array.isArray(scopes) || scopes.length === 0) return undefined;
  return scopes.includes(scope);
}

export function describeBusinessDiscoveryFailure(
  r: BusinessDiscoveryResult
): string {
  switch (r.failure) {
    case "permission_denied":
      return "The authorization did not grant access to the business portfolio (business_management). Reconnect and approve all requested permissions and assets, or add business_management to the Embedded Signup configuration.";
    case "token_invalid":
      return "The access token is invalid or expired. Please restart the signup flow.";
    case "no_business":
      return "No business portfolio was returned for this authorization.";
    case "no_waba":
      return "No WhatsApp Business Account is owned by the authorized business portfolio.";
    default:
      return "Could not read the business portfolio from Meta.";
  }
}

export async function discoverWabaViaBusinessPortfolio(
  fetchFn: FetchLike,
  apiVersion: string,
  token: string
): Promise<BusinessDiscoveryResult> {
  const headers = { Authorization: `Bearer ${token}` };
  const base = `https://graph.facebook.com/${apiVersion}`;

  try {
    const meData = await (
      await fetchFn(`${base}/me?fields=businesses`, { headers })
    ).json();

    if (meData?.error) {
      return {
        failure: classifyGraphError(meData.error),
        graphErrorCode: meData.error.code,
        graphErrorMessage: meData.error.message,
      };
    }

    // NOTE: do not fall back to meData.id — on /me that is a user id, not a
    // business id, and owned_whatsapp_business_accounts would not apply.
    const businessId: string | undefined = meData?.businesses?.data?.[0]?.id;
    if (!businessId) return { failure: "no_business" };

    const wabaData = await (
      await fetchFn(`${base}/${businessId}/owned_whatsapp_business_accounts`, {
        headers,
      })
    ).json();

    if (wabaData?.error) {
      return {
        businessId,
        failure: classifyGraphError(wabaData.error),
        graphErrorCode: wabaData.error.code,
        graphErrorMessage: wabaData.error.message,
      };
    }

    const wabaId: string | undefined = wabaData?.data?.[0]?.id;
    if (!wabaId) return { businessId, failure: "no_waba" };

    return { wabaId, businessId };
  } catch (e: any) {
    return { failure: "graph_error", graphErrorMessage: String(e?.message || e) };
  }
}
