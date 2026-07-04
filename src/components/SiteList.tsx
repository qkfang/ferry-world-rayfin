import type { TourismSite } from '../../rayfin/data/TourismSite';

interface SiteListProps {
  sites: TourismSite[];
  currentSiteId: string | null;
}

const CATEGORY_EMOJI: Record<string, string> = {
  wharf: '⛴️',
  landmark: '🏛️',
  park: '🌳',
  island: '🗿',
  attraction: '🎡',
  beach: '🏖️',
  precinct: '🏙️',
};

export function SiteList({ sites, currentSiteId }: SiteListProps) {
  if (sites.length === 0) {
    return (
      <p className="text-sm text-white/70">Charting the harbour route...</p>
    );
  }

  return (
    <ol className="space-y-2">
      {sites.map((site) => {
        const isCurrent = site.id === currentSiteId;
        return (
          <li key={site.id}>
            <div
              className={`rounded-xl border px-3 py-2 transition-colors ${
                isCurrent
                  ? 'border-amber-300 bg-amber-400/20'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-base">
                  {CATEGORY_EMOJI[site.category] ?? '📍'}
                </span>
                <span className="flex-1 font-semibold text-white">
                  {site.name}
                </span>
                {isCurrent && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                    Ferry here
                  </span>
                )}
              </div>
              {isCurrent && (
                <p className="mt-1 text-xs leading-relaxed text-white/80">
                  {site.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
