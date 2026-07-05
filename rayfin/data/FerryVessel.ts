import {
  authenticated,
  date,
  decimal,
  entity,
  text,
  uuid,
} from '@microsoft/rayfin-core';

// GPS reference calibration for the Sydney Harbour voxel scene.
// Positions are derived from the Fabric Eventhouse SydneyFerries table
// which provides real-time lat/lng from the Transport for NSW feed.
// Frontend converts GPS → scene grid via gpsToScene() in useFerries.ts.

/**
 * A live ferry vessel cruising Sydney Harbour.
 *
 * These records are the "live" side of the harbour: a backend feed (e.g. the
 * Transport for NSW real-time ferry positions) writes a row per vessel and
 * keeps its position updated. The voxel scene reads these rows and drives each
 * ferry to its reported position instead of looping the static route, so the
 * on-screen ferry mirrors the real boat. Positions are expressed in the same
 * scene-grid space as {@link TourismSite} (posX/posZ) so vessels and landmarks
 * share one coordinate system.
 */
@entity()
@authenticated('*')
export class FerryVessel {
  @uuid() id!: string;
  /** Vessel name, e.g. "Freshwater" or "Fishburn". */
  @text({ min: 1, max: 100 }) name!: string;
  /** Route/service label shown in the HUD, e.g. "F1 Manly". */
  @text({ max: 60 }) routeName!: string;
  /** East-west position in the voxel scene grid (matches TourismSite.posX). */
  @decimal() posX!: number;
  /** North-south position in the voxel scene grid (matches TourismSite.posZ). */
  @decimal() posZ!: number;
  /** Heading in degrees clockwise from north (+Z). 0 = north, 90 = east. */
  @decimal() heading!: number;
  /** Hex colour used for the voxel hull, e.g. "#1f6f4a". */
  @text({ max: 20 }) color!: string;
  /** Timestamp of the last position report. */
  @date() updatedAt!: Date;
  /**
   * GPS latitude from the Fabric Eventhouse SydneyFerries feed (ferry_lat).
   * When set, the frontend derives posX/posZ via the GPS→scene transform.
   */
  @decimal() lat?: number;
  /**
   * GPS longitude from the Fabric Eventhouse SydneyFerries feed (ferry_long).
   * When set, the frontend derives posX/posZ via the GPS→scene transform.
   */
  @decimal() lng?: number;
  /**
   * Ferry destination from the live feed (ferry_destination), e.g. "Manly".
   * Displayed in the HUD alongside routeName.
   */
  @text({ max: 100 }) destination?: string;
}
