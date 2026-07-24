import { isEmbeddedMode } from '@microsoft/fabric-embedded-host';

import type { FerryFeed, FerryScheduleFeed, ReferenceFeed } from '@/shared/contract';

import { colIndex, isDirectKustoConfigured, queryKusto } from './kustoClient';
import { getRayfinClient } from './rayfinClient';

const API_BASE = import.meta.env.VITE_FERRY_API ?? '/api';

/**
 * True when the app is running inside the Fabric portal iframe. In that case we
 * read the ferry data through the Rayfin backend (GraphQL, using the session
 * the portal already established) instead of calling the Eventhouse directly —
 * no MSAL token and no extra sign-in are needed.
 */
function isFabricEmbedded(): boolean {
  return isEmbeddedMode({});
}

/** True when served from the Vite dev server (the `/api` middleware exists). */
function isLocalFrontend(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * In the deployed app there is no `/api` middleware, so query the Eventhouse
 * directly (browser → Kusto with the signed-in user's token). Locally we keep
 * using the Vite dev API.
 */
const useDirectKusto = !isLocalFrontend() && isDirectKustoConfigured();

// --- Direct-Kusto query layer (mirrors vite/ferryApi.ts) --------------------

// Only surface ferries whose latest ping is within this window of the most
// recent sample in the table — i.e. the current active batch.
const ACTIVE_WINDOW = '15m';
const LATEST_KQL = `SydneyFerries | summarize latest = max(timestamp)`;

function ferriesKql(latestIso: string): string {
  return `
SydneyFerries
| summarize arg_max(timestamp, *) by ferry_name
| where timestamp > todatetime('${latestIso}') - ${ACTIVE_WINDOW}
| project ferry_name, ferry_lat, ferry_long, ferry_destination, timestamp
`;
}

const REF_KQL = `
ReferenceLocation
| project LocationId, LocationName, Latitude, Longitude
`;

async function fetchFerriesDirect(signal?: AbortSignal): Promise<FerryFeed> {
  const lt = await queryKusto(LATEST_KQL, signal);
  const latestIso = String(lt.Rows?.[0]?.[0] ?? '');
  const t = await queryKusto(ferriesKql(latestIso), signal);
  const iName = colIndex(t, 'ferry_name');
  const iLat = colIndex(t, 'ferry_lat');
  const iLon = colIndex(t, 'ferry_long');
  const iDest = colIndex(t, 'ferry_destination');
  const iTs = colIndex(t, 'timestamp');
  const ferries = t.Rows.map((r) => ({
    id: String(r[iName]),
    name: String(r[iName]),
    lat: Number(r[iLat]),
    lon: Number(r[iLon]),
    destination: r[iDest] == null ? '' : String(r[iDest]),
    ts: new Date(String(r[iTs])).getTime(),
  })).filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon));
  return { asOf: new Date().toISOString(), ferries };
}

async function fetchReferenceDirect(signal?: AbortSignal): Promise<ReferenceFeed> {
  const t = await queryKusto(REF_KQL, signal);
  const iId = colIndex(t, 'LocationId');
  const iName = colIndex(t, 'LocationName');
  const iLat = colIndex(t, 'Latitude');
  const iLon = colIndex(t, 'Longitude');
  const locations = t.Rows.map((r) => ({
    id: String(r[iId]),
    name: String(r[iName]),
    lat: Number(r[iLat]),
    lon: Number(r[iLon]),
  })).filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon));
  return { locations };
}

// --- Rayfin-native query layer (Fabric portal) ------------------------------

// Read the current-state snapshot tables through the Rayfin GraphQL client. The
// session is the one the Fabric portal already brokered, so no MSAL token or
// extra login is required. Rows are kept in sync with the Eventhouse upstream.
async function fetchFerriesRayfin(): Promise<FerryFeed> {
  const rows = await getRayfinClient()
    .data.Ferry.select(['ferry_name', 'ferry_lat', 'ferry_long', 'ferry_destination', 'timestamp'])
    .orderBy({ timestamp: 'desc' })
    .execute();
  // DAB has no group-by / arg_max, so dedupe client-side. Rows come newest
  // first, so the first time a ferry_name is seen is its latest record.
  const latest = new Map<string, FerryFeed['ferries'][number]>();
  for (const r of rows) {
    const name = String(r.ferry_name);
    if (latest.has(name)) continue;
    const lat = Number(r.ferry_lat);
    const lon = Number(r.ferry_long);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    latest.set(name, {
      id: name,
      name,
      lat,
      lon,
      destination: r.ferry_destination ?? '',
      ts: new Date(r.timestamp as unknown as string).getTime(),
    });
  }
  return { asOf: new Date().toISOString(), ferries: [...latest.values()] };
}

async function fetchReferenceRayfin(): Promise<ReferenceFeed> {
  const rows = await getRayfinClient()
    .data.ReferenceLocation.select(['id', 'name', 'lat', 'lon'])
    .execute();
  const locations = rows
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      lat: Number(r.lat),
      lon: Number(r.lon),
    }))
    .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon));
  return { locations };
}

// --- Public API -------------------------------------------------------------

/** Fetch the latest ferry positions. */
export async function fetchFerries(signal?: AbortSignal): Promise<FerryFeed> {
  if (isFabricEmbedded()) return fetchFerriesRayfin();
  if (useDirectKusto) return fetchFerriesDirect(signal);
  const res = await fetch(`${API_BASE}/ferries/live`, { signal });
  if (!res.ok) throw new Error(`ferries/live failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as FerryFeed;
}

/** Fetch wharves / landmarks used to dress the scene (called once at startup). */
export async function fetchReferenceLocations(signal?: AbortSignal): Promise<ReferenceFeed> {
  try {
    if (isFabricEmbedded()) return await fetchReferenceRayfin();
    if (useDirectKusto) return await fetchReferenceDirect(signal);
    const res = await fetch(`${API_BASE}/reference-locations`, { signal });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as ReferenceFeed;
  } catch {
    return { locations: [] };
  }
}

/**
 * Fetch today's scheduled ferry departures (TfNSW GTFS static timetable).
 * @param opts.upcoming Only departures at/after now (default true).
 * @param opts.limit    Cap the number of departures returned.
 *
 * The GTFS timetable requires a server-side call with a secret API key, which
 * is only available via the dev `/api` middleware. In the deployed app this
 * degrades to an empty schedule rather than failing.
 */
export async function fetchFerrySchedule(
  opts: { upcoming?: boolean; limit?: number } = {},
  signal?: AbortSignal,
): Promise<FerryScheduleFeed> {
  if (isFabricEmbedded() || useDirectKusto) {
    const today = new Date().toISOString().slice(0, 10);
    return { date: today, asOf: new Date().toISOString(), count: 0, departures: [] };
  }
  const params = new URLSearchParams();
  if (opts.upcoming === false) params.set('scope', 'all');
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/ferries/schedule${qs ? `?${qs}` : ''}`, { signal });
  if (!res.ok) throw new Error(`ferries/schedule failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as FerryScheduleFeed;
}
