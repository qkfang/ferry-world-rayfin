import type { TourismSite } from '../../../rayfin/data/TourismSite';
import type { SeedSite } from '../../data/harbourSites';
import { ISiteService } from '../interfaces/ISiteService';

import { getRayfinClient } from './RayfinClientService';

const SITE_FIELDS = [
  'id',
  'name',
  'description',
  'category',
  'routeOrder',
  'posX',
  'posZ',
  'color',
] as const;

export class RayfinSiteService implements ISiteService {
  async getSites(): Promise<TourismSite[]> {
    const client = getRayfinClient();
    const result = await client.data.TourismSite.select([...SITE_FIELDS])
      .orderBy({ routeOrder: 'asc' })
      .execute();

    return result;
  }

  async createSite(site: SeedSite): Promise<TourismSite> {
    const client = getRayfinClient();
    const result = await client.data.TourismSite.create({ ...site });
    return result;
  }
}
