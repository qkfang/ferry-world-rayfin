import type { FerryModelSpec } from './types';

/**
 * John Nutt — Parramatta River class.
 * Livery and hull proportions matched to the reference photo in
 * `data/ferry/John_Nutt.jpg`.
 */
export const FERRY_SPEC: FerryModelSpec = {
  name: 'John Nutt',
  fleetClass: 'Parramatta River class',
  hullType: 'catamaran',
  livery: {
    hull: 0xd7dee2,
    boot: 0x142430,
    cabin: 0xeef1f3,
    roof: 0xe3e8ea,
    trim: 0x1c3a5e,
    glass: 0x202b33,
    funnel: 0x1c3a5e,
  },
  scale: { length: 0.95, beam: 0.95 },
  decks: 1,
  hasFunnel: false,
  wheelhouse: 'center',
};
