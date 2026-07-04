import type { TourismSite } from '../../rayfin/data/TourismSite';

/**
 * Default Sydney Harbour tourism sites that make up the ferry route.
 *
 * These records seed the backend on first load and also act as an in-memory
 * fallback so the voxel harbour scene always renders, even without a backend.
 *
 * The scene grid is roughly laid out to match harbour geography:
 * - X (east-west): negative = west (Darling Harbour), positive = east (Heads)
 * - Z (north-south): negative = north shore, positive = south shore
 * `routeOrder` is the order the ferry visits each stop on its looping journey.
 */
export type SeedSite = Omit<TourismSite, 'id'>;

export const DEFAULT_SITES: SeedSite[] = [
  {
    name: 'Circular Quay',
    description:
      'The bustling ferry hub where every harbour journey begins, ringed by cafes and buskers.',
    category: 'wharf',
    routeOrder: 0,
    posX: -6,
    posZ: 10,
    color: '#c9a24b',
  },
  {
    name: 'Sydney Opera House',
    description:
      "Jorn Utzon's sail-shelled masterpiece on Bennelong Point, a UNESCO World Heritage icon.",
    category: 'landmark',
    routeOrder: 1,
    posX: 2,
    posZ: 6,
    color: '#eef0f2',
  },
  {
    name: 'Royal Botanic Garden',
    description:
      'Harbourside gardens wrapping around Farm Cove with palm groves and city skyline views.',
    category: 'park',
    routeOrder: 2,
    posX: 10,
    posZ: 9,
    color: '#4f8f4a',
  },
  {
    name: 'Fort Denison',
    description:
      'A tiny fortified island (Pinchgut) with a Martello tower guarding the inner harbour.',
    category: 'island',
    routeOrder: 3,
    posX: 16,
    posZ: 2,
    color: '#8a7f6b',
  },
  {
    name: 'Taronga Zoo',
    description:
      'Hillside zoo on the north shore with a cable car and animals framed by the skyline.',
    category: 'attraction',
    routeOrder: 4,
    posX: 14,
    posZ: -10,
    color: '#c46a3f',
  },
  {
    name: 'Watsons Bay',
    description:
      'Seaside village near South Head, famous for Doyles seafood and the Gap clifftops.',
    category: 'beach',
    routeOrder: 5,
    posX: 30,
    posZ: 4,
    color: '#e2c98f',
  },
  {
    name: 'Manly Wharf',
    description:
      'Gateway to Manly Beach, reached by the classic ocean-going harbour ferry run.',
    category: 'beach',
    routeOrder: 6,
    posX: 26,
    posZ: -14,
    color: '#e6d3a3',
  },
  {
    name: 'Luna Park',
    description:
      "The grinning-faced heritage amusement park beneath the bridge at Milsons Point.",
    category: 'attraction',
    routeOrder: 7,
    posX: -2,
    posZ: -10,
    color: '#e4b13a',
  },
  {
    name: 'Sydney Harbour Bridge',
    description:
      'The "Coathanger" steel arch linking the city to the north shore, climbable at the summit.',
    category: 'landmark',
    routeOrder: 8,
    posX: -6,
    posZ: -2,
    color: '#7c8a94',
  },
  {
    name: 'Barangaroo',
    description:
      'Regenerated western waterfront precinct with a headland reserve and harbourside dining.',
    category: 'precinct',
    routeOrder: 9,
    posX: -14,
    posZ: 2,
    color: '#b58a5e',
  },
  {
    name: 'Darling Harbour',
    description:
      'Lively western bay with the aquarium, maritime museum, and waterfront promenades.',
    category: 'precinct',
    routeOrder: 10,
    posX: -18,
    posZ: 12,
    color: '#5aa0c4',
  },
];
