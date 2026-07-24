import { Ferry } from './Ferry.js';
import { ReferenceLocation } from './ReferenceLocation.js';
import { VesselCheck } from './VesselCheck.js';

export type AppSchema = {
  Ferry: Ferry;
  ReferenceLocation: ReferenceLocation;
  VesselCheck: VesselCheck;
};

export const schema = [Ferry, ReferenceLocation, VesselCheck];
