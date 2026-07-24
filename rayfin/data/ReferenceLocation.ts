import { authenticated, entity, text, uuid } from '@microsoft/rayfin-core';

// Wharves / landmarks used to dress the scene, read via RayfinClient GraphQL
// when the app runs inside the Fabric portal.
@entity()
@authenticated('read')
export class ReferenceLocation {
  @uuid() id!: string;
  @text({ max: 200 }) name!: string;
  @text({ max: 32 }) lat!: string;
  @text({ max: 32 }) lon!: string;
}
