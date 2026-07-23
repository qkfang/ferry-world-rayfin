import type { FerryModelSpec } from './types';

/**
 * Ruth Park — River class.
 * Livery and hull proportions matched to the reference photo in
 * `data/ferry/Ruth_Park.jpg`.
 */
export const FERRY_SPEC: FerryModelSpec = {
  name: 'Ruth Park',
  fleetClass: 'River class',
  hullType: 'catamaran',
  livery: {
    hull: 0xe9edf0,
    boot: 0x16232c,
    cabin: 0xeef2f4,
    roof: 0xf5f7f8,
    trim: 0x1f8fa0,
    glass: 0x1b2a33,
    funnel: 0x1f8fa0,
  },
  scale: { length: 1.0, beam: 0.95 },
  decks: 2,
  hasFunnel: false,
  wheelhouse: 'forward',
};
