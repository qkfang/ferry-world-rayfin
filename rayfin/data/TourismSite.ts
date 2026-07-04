import {
  authenticated,
  decimal,
  entity,
  int,
  text,
  uuid,
} from '@microsoft/rayfin-core';

/**
 * A tourism site along the Sydney Harbour ferry route.
 *
 * Sites are shared reference data that drive the voxel harbour scene: each
 * record positions a voxel landmark in the scene and marks a stop on the
 * ferry's looping route. Any authenticated user can read and seed sites.
 */
@entity()
@authenticated('*')
export class TourismSite {
  @uuid() id!: string;
  /** Display name, e.g. "Sydney Opera House". */
  @text({ min: 1, max: 100 }) name!: string;
  /** Short blurb shown in the HUD. */
  @text({ max: 300 }) description!: string;
  /** Site category, e.g. "landmark", "beach", "wharf", "island". */
  @text({ max: 40 }) category!: string;
  /** Position of the ferry stop in the ferry's looping route (0-based). */
  @int() routeOrder!: number;
  /** East-west position in the voxel scene grid. */
  @decimal() posX!: number;
  /** North-south position in the voxel scene grid. */
  @decimal() posZ!: number;
  /** Hex colour used for the voxel landmark, e.g. "#e8e2d5". */
  @text({ max: 20 }) color!: string;
}
