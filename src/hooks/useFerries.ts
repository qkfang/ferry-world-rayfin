import { useCallback, useEffect, useRef, useState } from 'react';

import type { FerryVessel } from '../../rayfin/data/FerryVessel';
import { DEFAULT_FERRIES, type SeedFerry } from '../data/liveFerries';
import { ServiceContainer } from '../services/ServiceContainer';

/** How often we re-read the live ferry positions from Fabric (ms). */
const POLL_INTERVAL_MS = 3000;

interface UseFerriesResult {
  ferries: FerryVessel[];
  /** True when positions come from the Fabric backend, false for the local sim. */
  usingLiveData: boolean;
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

  const poll = useCallback(async () => {
    try {
      const live = await ferryService.getFerries();
      if (live.length > 0) {
        setFerries(live);
        setUsingLiveData(true);
        return;
      }
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
