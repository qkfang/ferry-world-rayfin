import type { FerryVessel } from '../../../rayfin/data/FerryVessel';

export interface IFerryService {
  /** Read the current live ferry positions. */
  getFerries(): Promise<FerryVessel[]>;
}
