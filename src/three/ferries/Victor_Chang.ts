import type { FerryModelSpec } from './types';

/**
 * Victor Chang — HarbourCat class.
 * Livery and hull proportions matched to the reference photo in
 * `data/ferry/Victor_Chang.jpg`.
 */
export const FERRY_SPEC: FerryModelSpec = {
  name: 'Victor Chang',
  fleetClass: 'HarbourCat class',
  hullType: 'catamaran',
  livery: {
    hull: 0xeef1f2,
    boot: 0x22282c,
    cabin: 0xf4f6f6,
    roof: 0xf7f9f9,
    trim: 0x1e2a33,
    glass: 0x232c33,
    funnel: 0x1e2a33,
  },
  scale: { length: 0.85, beam: 0.9 },
  decks: 1,
  hasFunnel: false,
  wheelhouse: 'center',
};
