import type { FerryVessel } from '../../rayfin/data/FerryVessel';

/**
 * Seed / in-memory fallback ferries for the "live" harbour feed.
 *
 * In production a backend job keeps {@link FerryVessel} rows updated from a
 * real-time source (e.g. Transport for NSW ferry positions). When no backend
 * is reachable these vessels stand in for that feed so the scene still shows
 * boats moving around the harbour. Positions are in the same scene grid as the
 * tourism sites (see src/data/harbourSites.ts).
 */
export type SeedFerry = Omit<FerryVessel, 'id' | 'updatedAt'>;

export const DEFAULT_FERRIES: SeedFerry[] = [
  {
    // Off Bennelong Point, steaming north-east toward Manly.
    name: 'Freshwater',
    routeName: 'F1 Manly',
    posX: 4,
    posZ: 4,
    heading: 45,
    color: '#1f6f4a',
  },
  {
    // Near Barangaroo on the western shore, heading back south.
    name: 'Fishburn',
    routeName: 'F4 Cross Harbour',
    posX: -8,
    posZ: 2,
    heading: 200,
    color: '#c2402f',
  },
  {
    // Out past Fort Denison in the inner harbour, running east.
    name: 'Catherine Hamlin',
    routeName: 'F9 Watsons Bay',
    posX: 20,
    posZ: 0,
    heading: 100,
    color: '#2f6fb0',
  },
];
