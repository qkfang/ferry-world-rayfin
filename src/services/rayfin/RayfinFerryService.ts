import type { FerryVessel } from '../../../rayfin/data/FerryVessel';
import { IFerryService } from '../interfaces/IFerryService';

import { getRayfinClient } from './RayfinClientService';

const FERRY_FIELDS = [
  'id',
  'name',
  'routeName',
  'posX',
  'posZ',
  'heading',
  'color',
  'updatedAt',
  'lat',
  'lng',
  'destination',
] as const;

export class RayfinFerryService implements IFerryService {
  async getFerries(): Promise<FerryVessel[]> {
    const client = getRayfinClient();
    const result = await client.data.FerryVessel.select([...FERRY_FIELDS])
      .orderBy({ name: 'asc' })
      .execute();

    return result;
  }
}
