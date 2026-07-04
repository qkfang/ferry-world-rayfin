import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { SiteList } from '../components/SiteList';
import { DEFAULT_SITES } from '../data/harbourSites';
import type { TourismSite } from '../../rayfin/data/TourismSite';

const sites: TourismSite[] = DEFAULT_SITES.slice(0, 3).map((site, index) => ({
  ...site,
  id: `site-${index}`,
}));

describe('SiteList', () => {
  it('renders every site on the route', () => {
    render(<SiteList sites={sites} currentSiteId={null} />);

    for (const site of sites) {
      expect(screen.getByText(site.name)).toBeInTheDocument();
    }
  });

  it('highlights the current site and shows its description', () => {
    render(<SiteList sites={sites} currentSiteId="site-1" />);

    expect(screen.getByText('Ferry here')).toBeInTheDocument();
    expect(screen.getByText(sites[1].description)).toBeInTheDocument();
    // Non-current sites do not show their description text.
    expect(screen.queryByText(sites[0].description)).not.toBeInTheDocument();
  });

  it('shows a charting message when there are no sites', () => {
    render(<SiteList sites={[]} currentSiteId={null} />);
    expect(screen.getByText(/charting the harbour route/i)).toBeInTheDocument();
  });
});
