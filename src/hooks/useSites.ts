import { useCallback, useEffect, useState } from 'react';

import type { TourismSite } from '../../rayfin/data/TourismSite';
import { DEFAULT_SITES } from '../data/harbourSites';
import { ServiceContainer } from '../services/ServiceContainer';

interface UseSitesResult {
  sites: TourismSite[];
  loading: boolean;
  error: string | null;
  usingFallback: boolean;
  refresh: () => Promise<void>;
}

/** Sort by route order so the ferry always visits stops in a stable sequence. */
function byRouteOrder(a: TourismSite, b: TourismSite): number {
  return a.routeOrder - b.routeOrder;
}

/** Build in-memory fallback sites (with synthetic ids) from the seed data. */
function fallbackSites(): TourismSite[] {
  return DEFAULT_SITES.map((site, index) => ({
    ...site,
    id: `local-${index}`,
  }));
}

export function useSites(): UseSitesResult {
  const [sites, setSites] = useState<TourismSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const siteService = ServiceContainer.getInstance().siteService;

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let data = await siteService.getSites();

      // Seed the Sydney Harbour sites on first load if the table is empty.
      if (data.length === 0) {
        await Promise.all(DEFAULT_SITES.map((site) => siteService.createSite(site)));
        data = await siteService.getSites();
      }

      setSites([...data].sort(byRouteOrder));
      setUsingFallback(false);
    } catch (err) {
      // The voxel scene should always render, so fall back to in-memory sites
      // when the backend is unavailable (e.g. before the first deploy).
      console.error('Failed to fetch tourism sites:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sites');
      setSites(fallbackSites());
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [siteService]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  return { sites, loading, error, usingFallback, refresh: fetchSites };
}
