import { Ferry } from './Ferry.js';
import { ReferenceLocation } from './ReferenceLocation.js';

export type AppSchema = {
  Ferry: Ferry;
  ReferenceLocation: ReferenceLocation;
};

export const schema = [Ferry, ReferenceLocation];
