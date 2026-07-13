/**
 * Browser-side Eventhouse (Kusto) client for the *deployed* app.
 *
 * In production there is no Vite `/api` middleware, so the frontend queries the
 * Fabric Real-Time Intelligence Eventhouse directly. It acquires an access
 * token for the cluster via MSAL using the signed-in user's identity (the same
 * user who is already authenticated with Fabric SSO), then POSTs KQL to the
 * cluster's `/v1/rest/query` endpoint. The Eventhouse allows CORS from the app
 * origin, so this works from the browser.
 *
 * Configuration (VITE_* env, set at build time):
 *   VITE_KUSTO_CLUSTER   Eventhouse cluster URI
 *   VITE_KUSTO_DATABASE  KQL database name
 *   VITE_ENTRA_CLIENT_ID Entra app (client) ID used for interactive sign-in
 *   VITE_ENTRA_TENANT_ID Entra tenant ID
 *   VITE_KUSTO_SCOPE     (optional) override for the token scope
 */
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type RedirectRequest,
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

let msalInstance: PublicClientApplication | null = null;
let msalReady: Promise<void> | null = null;

function getMsal(): PublicClientApplication {
  if (!CLIENT_ID) throw new Error('VITE_ENTRA_CLIENT_ID is not configured.');
  if (!msalInstance) {
    msalInstance = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    });
  }
  return msalInstance;
}

async function ensureMsalInitialized(): Promise<PublicClientApplication> {
  const msal = getMsal();
  if (!msalReady) {
    msalReady = msal.initialize().then(async () => {
      // Complete any pending redirect sign-in and adopt the returned account.
      const result = await msal.handleRedirectPromise();
      if (result?.account) msal.setActiveAccount(result.account);
      else if (!msal.getActiveAccount()) {
        const first = msal.getAllAccounts()[0];
        if (first) msal.setActiveAccount(first);
      }
    });
  }
  await msalReady;
  return msal;
}

// Cache the token and de-duplicate concurrent acquisitions so the 5s poll does
// not hammer MSAL.
let cachedToken: { token: string; expiresOn: number } | null = null;
let inFlight: Promise<string> | null = null;

async function acquireToken(): Promise<string> {
  const msal = await ensureMsalInitialized();
  const scopes = [SCOPE];
  const account: AccountInfo | undefined =
    msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? undefined;

  if (account) {
    try {
      const res = await msal.acquireTokenSilent({ scopes, account });
      return res.accessToken;
    } catch (err) {
      if (!(err instanceof InteractionRequiredAuthError)) throw err;
    }
  }

  // No cached account (or silent failed): try SSO against the active Entra
  // session using the signed-in user's login hint. No popup, no redirect.
  try {
    const res = await msal.ssoSilent(loginHint ? { scopes, loginHint } : { scopes });
    if (res.account) msal.setActiveAccount(res.account);
    return res.accessToken;
  } catch {
    // Do NOT fall back to an automatic interactive flow — that causes the
    // popup/redirect loop. Surface a typed error the UI can act on.
    throw new KustoInteractionRequiredError();
  }
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
 * User-initiated interactive sign-in (redirect). Call ONLY from a click
 * handler — never automatically. Navigates the window to Entra and back; on
 * return `handleRedirectPromise` completes the sign-in and tokens are cached.
 */
export async function connectDataInteractive(): Promise<void> {
  const msal = await ensureMsalInitialized();
  const request: RedirectRequest = loginHint
    ? { scopes: [SCOPE], loginHint }
    : { scopes: [SCOPE] };
  await msal.acquireTokenRedirect(request);
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
