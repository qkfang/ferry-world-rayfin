import { authenticated, date, entity, text, uuid } from '@microsoft/rayfin-core';

// Current-state ferry positions read by the app when it runs inside the Fabric
// portal (via RayfinClient GraphQL). One row per ferry holds its latest known
// position; an upstream Fabric pipeline keeps it in sync with the Eventhouse.
// Coordinates are stored as text to preserve full precision (DAB decimal scale
// is not controllable).
@entity()
@authenticated('read')
export class Ferry {
  @uuid() id!: string;
  @text({ max: 120 }) ferry_name!: string;
  @text({ max: 32 }) ferry_lat!: string;
  @text({ max: 32 }) ferry_long!: string;
  @text({ max: 200, optional: true }) ferry_destination?: string;
  @date() timestamp!: Date;
}
