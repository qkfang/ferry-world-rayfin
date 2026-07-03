import type { TourismSite } from '../../../rayfin/data/TourismSite';
import type { SeedSite } from '../../data/harbourSites';

export interface ISiteService {
  getSites(): Promise<TourismSite[]>;
  createSite(site: SeedSite): Promise<TourismSite>;
}
