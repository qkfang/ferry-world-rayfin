/**
 * Browser-side Eventhouse (Kusto) client for the *deployed* app.
 *
 * In production there is no Vite `/api` middleware, so the frontend queries the
 * Fabric Real-Time Intelligence Eventhouse directly. It acquires an access
 * token for the cluster via MSAL using the signed-in user's identity, then
 * POSTs KQL to the cluster's `/v1/rest/query` endpoint. The Eventhouse allows
 * CORS from the app origin, so this works from the browser.
 *
 * Two runtime modes, both driven by the same MSAL instance:
 *   - Inside the Fabric portal (embedded iframe) — Nested App Auth (NAA) lets
 *     the host broker a token silently for the user who is already signed in to
 *     Fabric. No popup, redirect, or extra login: live data "just works".
 *   - Standalone browser tab — no host broker is present, so a one-time
 *     interactive sign-in is required. The UI surfaces a "Connect live data"
 *     button that calls connectDataInteractive() from a user gesture.
 *
 * Configuration (VITE_* env, set at build time):
 *   VITE_KUSTO_CLUSTER   Eventhouse cluster URI
 *   VITE_KUSTO_DATABASE  KQL database name
 *   VITE_ENTRA_CLIENT_ID Entra app (client) ID used for interactive sign-in
 *   VITE_ENTRA_TENANT_ID Entra tenant ID
 *   VITE_KUSTO_SCOPE     (optional) override for the token scope
 */
import {
  createNestablePublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
  type IPublicClientApplication,
  type PopupRequest,
  type RedirectRequest,
  type SsoSilentRequest,
} from '@azure/msal-browser';

const CLUSTER = import.meta.env.VITE_KUSTO_CLUSTER as string | undefined;
const DATABASE = (import.meta.env.VITE_KUSTO_DATABASE as string | undefined) ?? 'SydneyFerriesKustoDB';
const CLIENT_ID = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined;
const TENANT_ID = (import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined) ?? 'organizations';
// The Eventhouse accepts a token whose audience is the cluster URI and whose
// scope is `user_impersonation`. We request that scope (rather than `.default`)
// so Entra grants it via dynamic consent even though the app registration has
// no statically-configured Kusto permission.
const SCOPE = (import.meta.env.VITE_KUSTO_SCOPE as string | undefined) ?? (CLUSTER ? `${CLUSTER}/user_impersonation` : '');

/** True when direct Eventhouse access is configured (deployed build). */
export function isDirectKustoConfigured(): boolean {
  return Boolean(CLUSTER && CLIENT_ID);
}

/**
 * True when the app runs inside an iframe (e.g. embedded in the Fabric portal).
 * MSAL forbids the redirect flow in a frame, so interactive sign-in must use a
 * popup instead.
 */
function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // A cross-origin `window.top` access throws — which itself means we're framed.
    return true;
  }
}

/**
 * True when a Nested App Auth bridge (host token broker) is available — the
 * Fabric portal injects this into embedded apps. Under NAA, MSAL brokers tokens
 * through the host with no popup, redirect, or hidden iframe (all of which are
 * blocked in the portal's sandboxed frame).
 */
function isNaaAvailable(): boolean {
  return (
    typeof (window as { __initializeNestedAppAuth?: unknown }).__initializeNestedAppAuth ===
    'function'
  );
}

export function getClusterUri(): string {
  if (!CLUSTER) throw new Error('VITE_KUSTO_CLUSTER is not configured.');
  return CLUSTER;
}

export function getDatabase(): string {
  return DATABASE;
}

/** Error thrown when a token can only be obtained via user interaction. */
export class KustoInteractionRequiredError extends Error {
  constructor(message = 'Sign-in required to load live ferry data.') {
    super(message);
    this.name = 'KustoInteractionRequiredError';
  }
}

let loginHint: string | undefined;
/** Provide the signed-in user's UPN/email so SSO-silent can target the session. */
export function setKustoLoginHint(hint: string | undefined): void {
  loginHint = hint;
}

let msalReady: Promise<IPublicClientApplication> | null = null;

/**
 * Create (once) a "nestable" MSAL instance. When the app is embedded in the
 * Fabric portal it uses Nested App Auth (host broker); standalone it behaves
 * like a normal browser SPA. `createNestablePublicClientApplication` resolves
 * only after the instance is initialized.
 */
async function ensureMsalInitialized(): Promise<IPublicClientApplication> {
  if (!CLIENT_ID) throw new Error('VITE_ENTRA_CLIENT_ID is not configured.');
  const clientId = CLIENT_ID;
  if (!msalReady) {
    msalReady = (async () => {
      const msal = await createNestablePublicClientApplication({
        auth: {
          clientId,
          authority: `https://login.microsoftonline.com/${TENANT_ID}`,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'localStorage' },
      });
      // Complete any pending redirect sign-in (standalone path) and adopt the
      // returned account. A no-op under NAA.
      const result = await msal.handleRedirectPromise();
      if (result?.account) msal.setActiveAccount(result.account);
      else if (!msal.getActiveAccount()) {
        const first = msal.getAllAccounts()[0];
        if (first) msal.setActiveAccount(first);
      }
      return msal;
    })();
  }
  return msalReady;
}

// Cache the token and de-duplicate concurrent acquisitions so the 5s poll does
// not hammer MSAL.
let cachedToken: { token: string; expiresOn: number } | null = null;
let inFlight: Promise<string> | null = null;

/** Store an MSAL result's access token so subsequent polls reuse it. */
function cacheResult(res: AuthenticationResult): void {
  cachedToken = {
    token: res.accessToken,
    expiresOn: res.expiresOn ? res.expiresOn.getTime() : Date.now() + 5 * 60_000,
  };
}

async function acquireToken(): Promise<string> {
  const msal = await ensureMsalInitialized();
  const scopes = [SCOPE];
  const account: AccountInfo | undefined =
    msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? undefined;

  // 1. Silent with a known account — a cached/refresh token in a standalone
  //    browser, or a host-brokered token once NAA has adopted the portal's
  //    active account.
  if (account) {
    try {
      const res = await msal.acquireTokenSilent({ scopes, account });
      if (res.account) msal.setActiveAccount(res.account);
      cacheResult(res);
      return res.accessToken;
    } catch (err) {
      // Standalone, non-interaction failures (e.g. network) are real errors.
      if (
        !isNaaAvailable() &&
        !isEmbedded() &&
        !(err instanceof InteractionRequiredAuthError)
      ) {
        throw err;
      }
      // Otherwise fall through to the brokered / SSO-silent attempt below.
    }
  }

  // 2. No-UI SSO:
  //    - Fabric portal (NAA): the host broker returns a token with no popup,
  //      redirect, or hidden iframe — this is what makes the embedded app work
  //      without any additional user login.
  //    - Standalone top-level window: reuses an existing Entra session if one
  //      is present (still no prompt).
  //    A plain (non-NAA) sandboxed iframe can do neither, so skip to the button.
  if (isNaaAvailable() || !isEmbedded()) {
    try {
      const req: SsoSilentRequest = loginHint ? { scopes, loginHint } : { scopes };
      const res = await msal.ssoSilent(req);
      if (res.account) msal.setActiveAccount(res.account);
      cacheResult(res);
      return res.accessToken;
    } catch {
      // No silent session — fall through to the interactive prompt.
    }
  }

  // 3. Interaction required. The UI shows a "Connect live data" button that
  //    calls connectDataInteractive() from a user gesture (a brokered popup
  //    under NAA, or a redirect to Entra sign-in standalone).
  throw new KustoInteractionRequiredError();
}

/** Acquire an access token for the Eventhouse cluster (silent, cached). */
async function getKustoToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresOn - Date.now() > 60_000) {
    return cachedToken.token;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const token = await acquireToken();
    // Decode exp from the JWT to know when to refresh.
    let expiresOn = Date.now() + 5 * 60_000;
    try {
      const payload = JSON.parse(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
      );
      if (payload.exp) expiresOn = payload.exp * 1000;
    } catch {
      // keep default
    }
    cachedToken = { token, expiresOn };
    return token;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * User-initiated interactive sign-in. Call ONLY from a click handler — never
 * automatically.
 *
 * - Embedded in the Fabric portal (NAA): a brokered popup — the host handles it
 *   with no real popup window, so it works inside the sandboxed iframe.
 * - Standalone top-level window: a redirect to Entra and back.
 * - A plain (non-NAA) iframe cannot complete interactive auth; surface a typed
 *   error instead of letting MSAL throw `block_nested_popups` / `redirect_in_iframe`.
 */
export async function connectDataInteractive(): Promise<void> {
  const msal = await ensureMsalInitialized();

  if (isNaaAvailable()) {
    const req: PopupRequest = loginHint
      ? { scopes: [SCOPE], loginHint }
      : { scopes: [SCOPE] };
    const res = await msal.acquireTokenPopup(req);
    if (res.account) msal.setActiveAccount(res.account);
    cacheResult(res);
    return;
  }

  if (isEmbedded()) {
    throw new KustoInteractionRequiredError(
      'Live data can’t be authorized inside this embedded host. Open the app in a new tab to connect.',
    );
  }

  const req: RedirectRequest = loginHint
    ? { scopes: [SCOPE], loginHint }
    : { scopes: [SCOPE] };
  await msal.acquireTokenRedirect(req);
}

export interface KustoTable {
  TableName?: string;
  Columns: { ColumnName: string }[];
  Rows: unknown[][];
}

/** Run a KQL query and return the primary result table (v1 REST). */
export async function queryKusto(csl: string, signal?: AbortSignal): Promise<KustoTable> {
  const token = await getKustoToken();
  const res = await fetch(`${getClusterUri()}/v1/rest/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ db: DATABASE, csl }),
    signal,
  });
  if (!res.ok) {
    // A 401 likely means the cached token was revoked; drop it so the next
    // call re-acquires silently.
    if (res.status === 401) cachedToken = null;
    throw new Error(`KQL query failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  const json = (await res.json()) as { Tables: KustoTable[] };
  return json.Tables[0];
}

export function colIndex(table: KustoTable, name: string): number {
  return table.Columns.findIndex((c) => c.ColumnName === name);
}
