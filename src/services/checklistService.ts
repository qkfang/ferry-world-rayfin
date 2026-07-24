import { isEmbeddedMode } from '@microsoft/fabric-embedded-host';

import type { NewVesselCheck, VesselCheck } from '@/shared/contract';

import { getRayfinClient } from './rayfinClient';

/**
 * True when running inside the Fabric portal iframe. There the checklist is
 * read/written through the Rayfin backend (GraphQL, using the portal session).
 * Outside Fabric (local dev) there is no authenticated Rayfin session, so a
 * localStorage store keeps the feature usable while developing.
 */
function isFabricEmbedded(): boolean {
  return isEmbeddedMode({});
}

// --- Rayfin-native layer (Fabric portal) ------------------------------------

async function fetchChecksRayfin(): Promise<VesselCheck[]> {
  const rows = await getRayfinClient()
    .data.VesselCheck.select([
      'id',
      'ferry_name',
      'category',
      'item',
      'status',
      'notes',
      'inspector',
      'timestamp',
    ])
    .orderBy({ timestamp: 'desc' })
    .execute();
  return rows.map((r) => ({
    id: String(r.id),
    ferryName: String(r.ferry_name),
    category: r.category as VesselCheck['category'],
    item: String(r.item),
    status: r.status as VesselCheck['status'],
    notes: r.notes ?? undefined,
    inspector: r.inspector ?? undefined,
    ts: new Date(r.timestamp as unknown as string).getTime(),
  }));
}

async function createCheckRayfin(input: NewVesselCheck): Promise<void> {
  await getRayfinClient().data.VesselCheck.create({
    ferry_name: input.ferryName,
    category: input.category,
    item: input.item,
    status: input.status,
    notes: input.notes,
    inspector: input.inspector,
    timestamp: new Date(),
  });
}

// --- Local dev layer (localStorage) -----------------------------------------

const LOCAL_KEY = 'vessel-checks';

function readLocal(): VesselCheck[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as VesselCheck[]) : [];
  } catch {
    return [];
  }
}

function fetchChecksLocal(): VesselCheck[] {
  return readLocal().sort((a, b) => b.ts - a.ts);
}

function createCheckLocal(input: NewVesselCheck): void {
  const rows = readLocal();
  rows.push({
    id: crypto.randomUUID(),
    ferryName: input.ferryName,
    category: input.category,
    item: input.item,
    status: input.status,
    notes: input.notes,
    inspector: input.inspector,
    ts: Date.now(),
  });
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
}

// --- Public API -------------------------------------------------------------

/** Fetch all logged vessel checks, newest first. */
export async function fetchVesselChecks(): Promise<VesselCheck[]> {
  if (isFabricEmbedded()) return fetchChecksRayfin();
  return fetchChecksLocal();
}

/** Log a new vessel check. */
export async function createVesselCheck(input: NewVesselCheck): Promise<void> {
  if (isFabricEmbedded()) return createCheckRayfin(input);
  createCheckLocal(input);
}
