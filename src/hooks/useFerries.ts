import { useCallback, useEffect, useRef, useState } from 'react';

import type { FerryVessel } from '../../rayfin/data/FerryVessel';
import { DEFAULT_FERRIES, type SeedFerry } from '../data/liveFerries';
import { ServiceContainer } from '../services/ServiceContainer';

/** How often we re-read the live ferry positions from Fabric (ms). */
const POLL_INTERVAL_MS = 3000;

// GPS-to-scene calibration constants for Sydney Harbour.
// Reference: Circular Quay (lat=-33.8612, lng=151.2111) → scene (-6, 10)
//            Manly Wharf   (lat=-33.7976, lng=151.2849) → scene (26, -14)
const GPS_REF_LAT = -33.8612;
const GPS_REF_LNG = 151.2111;
const GPS_SCALE_X = 434; // scene units per degree longitude (east = +X)
const GPS_SCALE_Z = -377; // scene units per degree latitude  (north = -Z)
const GPS_OFFSET_X = -6;
const GPS_OFFSET_Z = 10;

interface UseFerriesResult {
  ferries: FerryVessel[];
  /** True when positions come from the Fabric backend, false for the local sim. */
  usingLiveData: boolean;
}

/**
 * Convert a GPS lat/lng (WGS-84) to the voxel harbour scene grid.
 * The linear transform is calibrated on two Sydney Harbour reference points.
 */
function gpsToScene(lat: number, lng: number): { posX: number; posZ: number } {
  return {
    posX: (lng - GPS_REF_LNG) * GPS_SCALE_X + GPS_OFFSET_X,
    posZ: (lat - GPS_REF_LAT) * GPS_SCALE_Z + GPS_OFFSET_Z,
  };
}

/**
 * Compute a heading (degrees clockwise from north/+Z) from the scene-grid
 * displacement between two consecutive positions.
 * Scene grid convention: +X = east, +Z = north.
 * Returns undefined when there is no meaningful movement.
 */
function headingFromMovement(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number
): number | undefined {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  if (dx === 0 && dz === 0) return undefined;
  return ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
}

/** Wrap a scene-grid coordinate so vessels loop instead of drifting away. */
function wrap(value: number, limit: number): number {
  if (value > limit) return value - 2 * limit;
  if (value < -limit) return value + 2 * limit;
  return value;
}

/**
 * Advance the offline fallback ferries one step along their heading so the
 * scene still shows boats moving when no live feed is available. This mimics
 * the position updates a real Fabric feed would push.
 */
function simulate(prev: FerryVessel[]): FerryVessel[] {
  const now = new Date();
  return prev.map((ferry) => {
    const rad = (ferry.heading * Math.PI) / 180;
    // Heading is clockwise from north (+Z): x uses sin, z uses cos.
    const step = 1.6;
    const posX = wrap(ferry.posX + Math.sin(rad) * step, 34);
    const posZ = wrap(ferry.posZ + Math.cos(rad) * step, 20);
    // Gently wander the heading so paths curve around the harbour.
    const heading = (ferry.heading + 14) % 360;
    return { ...ferry, posX, posZ, heading, updatedAt: now };
  });
}

/** Build starting fallback vessels (with synthetic ids) from the seed data. */
function seedFerries(seed: SeedFerry[]): FerryVessel[] {
  const now = new Date();
  return seed.map((ferry, index) => ({
    ...ferry,
    id: `sim-${index}`,
    updatedAt: now,
  }));
}

/**
 * Apply GPS→scene conversion for ferries that carry lat/lng from the Fabric
 * Eventhouse (SydneyFerries table). When lat/lng are present they take
 * precedence over the stored posX/posZ. Heading is inferred from the direction
 * of travel between the previous and current GPS position.
 * Stale entries (vessels no longer in the feed) are pruned from prevPos.
 */
function applyGpsPositions(
  vessels: FerryVessel[],
  prev: Map<string, { posX: number; posZ: number; heading: number }>
): FerryVessel[] {
  const activeIds = new Set(vessels.map((v) => v.id));
  for (const id of prev.keys()) {
    if (!activeIds.has(id)) prev.delete(id);
  }

  return vessels.map((v) => {
    if (v.lat == null || v.lng == null) return v;

    const { posX, posZ } = gpsToScene(v.lat, v.lng);
    const existing = prev.get(v.id);
    const computed = existing
      ? headingFromMovement(existing.posX, existing.posZ, posX, posZ)
      : undefined;
    const heading = computed ?? existing?.heading ?? v.heading;

    prev.set(v.id, { posX, posZ, heading });
    return { ...v, posX, posZ, heading };
  });
}

/**
 * Poll the live ferry positions from Fabric. When the backend is unreachable
 * or has no vessels yet, fall back to a local simulation so the harbour is
 * never empty.
 */
export function useFerries(): UseFerriesResult {
  const [ferries, setFerries] = useState<FerryVessel[]>(() =>
    seedFerries(DEFAULT_FERRIES)
  );
  const [usingLiveData, setUsingLiveData] = useState(false);

  const ferryService = ServiceContainer.getInstance().ferryService;
  // Keep the latest sim state without retriggering the polling effect.
  const simRef = useRef<FerryVessel[]>(ferries);
  // Track previous scene positions for heading derivation.
  const prevPosRef = useRef<
    Map<string, { posX: number; posZ: number; heading: number }>
  >(new Map());

  const poll = useCallback(async () => {
    try {
      const live = await ferryService.getFerries();
      if (live.length > 0) {
        const resolved = applyGpsPositions(live, prevPosRef.current);
        setFerries(resolved);
        setUsingLiveData(true);
        return;
      }
      // Empty response and errors are treated the same on purpose: the harbour
      // should never look deserted, so we fall through to the local sim.
    } catch {
      // Backend unavailable (e.g. before the first deploy) — use the sim.
    }
    simRef.current = simulate(simRef.current);
    setFerries(simRef.current);
    setUsingLiveData(false);
  }, [ferryService]);

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (active) poll();
    };
    tick();
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [poll]);

  return { ferries, usingLiveData };
}
